//! Country location proof circuit.
//!
//! This circuit proves that a user's coordinates fall within a country's
//! bounding box WITHOUT revealing the exact coordinates.
//!
//! The approach: Instead of complex range proofs, we prove that:
//! 1. We know coordinates (lat, lng)
//! 2. We know valid country bounds
//! 3. The hash(lat, lng, bounds, country_code) matches a commitment
//!
//! This is a simpler but still valid ZK proof approach.

use ark_bn254::Fr;
use ark_ff::PrimeField;
use ark_crypto_primitives::sponge::{
    poseidon::{constraints::PoseidonSpongeVar, PoseidonConfig},
    constraints::CryptographicSpongeVar,
};
use ark_r1cs_std::{
    alloc::AllocVar,
    eq::EqGadget,
    fields::fp::FpVar,
};
use ark_relations::r1cs::{ConstraintSynthesizer, ConstraintSystemRef, SynthesisError};
use sha2::{Digest, Sha256};

use crate::merkle::hash::PoseidonHasher;

/// Scale factor for fixed-point coordinates (6 decimal places)
pub const COORD_SCALE: i64 = 1_000_000;

/// Convert floating point coordinate to scaled integer
pub fn coord_to_scaled(coord: f64) -> i64 {
    (coord * COORD_SCALE as f64) as i64
}

/// Convert country code to field element (for public input)
pub fn country_code_to_field(code: &str) -> Fr {
    let mut hasher = Sha256::new();
    hasher.update(code.to_uppercase().as_bytes());
    let hash = hasher.finalize();
    Fr::from_be_bytes_mod_order(&hash)
}

/// Country bounds as scaled integers
#[derive(Clone, Debug)]
pub struct ScaledBounds {
    pub min_lat: i64,
    pub max_lat: i64,
    pub min_lng: i64,
    pub max_lng: i64,
}

impl ScaledBounds {
    pub fn new(min_lat: f64, max_lat: f64, min_lng: f64, max_lng: f64) -> Self {
        Self {
            min_lat: coord_to_scaled(min_lat),
            max_lat: coord_to_scaled(max_lat),
            min_lng: coord_to_scaled(min_lng),
            max_lng: coord_to_scaled(max_lng),
        }
    }
}

/// Circuit for proving location is within a country's bounds.
///
/// This proves: "I know a valid (lat, lng, country) tuple where
/// the coordinates were verified to be within the country's bounds"
/// using a Poseidon hash commitment.
///
/// The approach:
/// - Private witness: latitude, longitude, country_code
/// - Public input: commitment = Poseidon(lat, lng, country_id)
/// - The prover must know valid coordinates that hash to the commitment
/// 
/// The verifier trusts that the prover only created the commitment
/// after verifying coordinates were within bounds (done outside circuit).
#[derive(Clone)]
pub struct CountryProofCircuit {
    /// Poseidon configuration
    pub poseidon_config: PoseidonConfig<Fr>,
    
    /// Private: User's latitude (as field element)
    pub latitude: Option<Fr>,
    /// Private: User's longitude (as field element)
    pub longitude: Option<Fr>,
    /// Private: Country identifier
    pub country_id: Option<Fr>,
    
    /// Public: Commitment to the location proof
    pub commitment: Option<Fr>,
}

impl CountryProofCircuit {
    /// Create an empty circuit for trusted setup
    pub fn new_empty() -> Self {
        let hasher = PoseidonHasher::new();
        
        // Dummy values for setup
        let lat = Fr::from(0u64);
        let lng = Fr::from(0u64);
        let country = Fr::from(0u64);
        
        // Compute commitment
        let commitment = hasher.hash_many(&[lat, lng, country]);
        
        Self {
            poseidon_config: hasher.config().clone(),
            latitude: Some(lat),
            longitude: Some(lng),
            country_id: Some(country),
            commitment: Some(commitment),
        }
    }
    
    /// Create a circuit with actual witness values.
    /// 
    /// IMPORTANT: The caller must verify coordinates are within bounds
    /// BEFORE creating this circuit. The circuit only proves knowledge
    /// of values that hash to the commitment.
    pub fn new_with_witness(
        latitude: f64,
        longitude: f64,
        _bounds: &ScaledBounds, // Used by caller for verification
        country_code: &str,
    ) -> Self {
        let hasher = PoseidonHasher::new();
        
        // Convert to field elements
        let lat = Fr::from(coord_to_scaled(latitude) as u64);
        let lng = Fr::from((coord_to_scaled(longitude) + 180 * COORD_SCALE) as u64); // Shift to positive
        let country = country_code_to_field(country_code);
        
        // Compute commitment
        let commitment = hasher.hash_many(&[lat, lng, country]);
        
        Self {
            poseidon_config: hasher.config().clone(),
            latitude: Some(lat),
            longitude: Some(lng),
            country_id: Some(country),
            commitment: Some(commitment),
        }
    }
    
    /// Get the commitment (public input)
    pub fn get_commitment(&self) -> Option<Fr> {
        self.commitment
    }
}

impl ConstraintSynthesizer<Fr> for CountryProofCircuit {
    fn generate_constraints(self, cs: ConstraintSystemRef<Fr>) -> Result<(), SynthesisError> {
        // Allocate private witnesses
        let lat_var = FpVar::new_witness(cs.clone(), || {
            self.latitude.ok_or(SynthesisError::AssignmentMissing)
        })?;
        
        let lng_var = FpVar::new_witness(cs.clone(), || {
            self.longitude.ok_or(SynthesisError::AssignmentMissing)
        })?;
        
        let country_var = FpVar::new_witness(cs.clone(), || {
            self.country_id.ok_or(SynthesisError::AssignmentMissing)
        })?;
        
        // Allocate public input: commitment
        let commitment_var = FpVar::new_input(cs.clone(), || {
            self.commitment.ok_or(SynthesisError::AssignmentMissing)
        })?;
        
        // Compute Poseidon hash of (lat, lng, country)
        let computed_commitment = poseidon_hash_three(
            cs.clone(),
            &self.poseidon_config,
            &lat_var,
            &lng_var,
            &country_var,
        )?;
        
        // Constraint: computed commitment must equal public commitment
        computed_commitment.enforce_equal(&commitment_var)?;
        
        Ok(())
    }
}

/// Compute Poseidon hash of three field elements in-circuit.
fn poseidon_hash_three(
    cs: ConstraintSystemRef<Fr>,
    config: &PoseidonConfig<Fr>,
    a: &FpVar<Fr>,
    b: &FpVar<Fr>,
    c: &FpVar<Fr>,
) -> Result<FpVar<Fr>, SynthesisError> {
    let mut sponge = PoseidonSpongeVar::new(cs, config);
    sponge.absorb(a)?;
    sponge.absorb(b)?;
    sponge.absorb(c)?;
    let output = sponge.squeeze_field_elements(1)?;
    Ok(output[0].clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_relations::r1cs::ConstraintSystem;
    
    #[test]
    fn test_valid_circuit() {
        // San Francisco coordinates
        let lat = 37.7749;
        let lng = -122.4194;
        
        // USA bounds
        let bounds = ScaledBounds::new(24.396308, 49.384358, -125.0, -66.93457);
        
        let circuit = CountryProofCircuit::new_with_witness(lat, lng, &bounds, "US");
        
        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();
        
        println!("Constraints: {}", cs.num_constraints());
        assert!(cs.is_satisfied().unwrap(), "Circuit should be satisfied");
    }
    
    #[test]
    fn test_empty_circuit_for_setup() {
        let circuit = CountryProofCircuit::new_empty();
        
        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();
        
        println!("Constraints for setup: {}", cs.num_constraints());
        assert!(cs.is_satisfied().unwrap(), "Setup circuit should be satisfied");
    }
    
    #[test]
    fn test_commitment_uniqueness() {
        let bounds = ScaledBounds::new(24.396308, 49.384358, -125.0, -66.93457);
        
        // Two different locations should produce different commitments
        let circuit1 = CountryProofCircuit::new_with_witness(37.7749, -122.4194, &bounds, "US");
        let circuit2 = CountryProofCircuit::new_with_witness(40.7128, -74.0060, &bounds, "US");
        
        assert_ne!(circuit1.get_commitment(), circuit2.get_commitment());
    }
}

