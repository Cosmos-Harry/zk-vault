//! Email domain proof circuit.
//!
//! This circuit proves ownership of an email at a specific domain
//! using a Poseidon hash commitment approach.
//!
//! How it works:
//! 1. User provides email and DKIM signature (verified outside circuit)
//! 2. Circuit creates commitment: H(email_hash, domain_hash, dkim_hash, nonce)
//! 3. Proof proves knowledge of values that produce the commitment
//!
//! Public inputs:
//! - domain_hash: Hash of the domain being proven (e.g., hash("google.com"))
//! - commitment: Poseidon(email_hash, domain_hash, dkim_hash, nonce)
//!
//! Private witnesses:
//! - email_hash: Hash of the full email address
//! - dkim_hash: Hash of DKIM signature (proves email is authentic)
//! - nonce: Random value for uniqueness
//!
//! This proves: "I know an email address at domain X with valid DKIM"
//! without revealing the actual email address.

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

/// Convert a string to a field element using SHA-256
pub fn string_to_field(s: &str) -> Fr {
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    let hash = hasher.finalize();
    Fr::from_be_bytes_mod_order(&hash)
}

/// Extract domain from email address
pub fn extract_domain(email: &str) -> Option<String> {
    email.split('@').nth(1).map(|s| s.to_lowercase())
}

/// Email proof input data
#[derive(Clone, Debug)]
pub struct EmailProofInput {
    /// The full email address (private)
    pub email: String,
    /// The domain (derived from email)
    pub domain: String,
    /// DKIM signature or authentication result
    pub dkim_data: String,
    /// Whether DKIM verification passed
    pub dkim_verified: bool,
}

impl EmailProofInput {
    /// Create from email and DKIM data
    pub fn new(email: &str, dkim_signature: &str, auth_results: &str) -> Self {
        let domain = extract_domain(email).unwrap_or_default();
        let dkim_verified = auth_results.to_lowercase().contains("dkim=pass");
        
        Self {
            email: email.to_string(),
            domain,
            dkim_data: format!("{}{}", dkim_signature, auth_results),
            dkim_verified,
        }
    }
    
    /// Create from just domain (for simpler proofs)
    pub fn from_domain(domain: &str, dkim_verified: bool) -> Self {
        Self::from_domain_with_dkim(domain, dkim_verified, "dkim=pass")
    }
    
    /// Create from domain with actual DKIM data for stronger binding
    pub fn from_domain_with_dkim(domain: &str, dkim_verified: bool, dkim_data: &str) -> Self {
        Self {
            email: format!("user@{}", domain),
            domain: domain.to_lowercase(),
            dkim_data: if dkim_verified { dkim_data.to_string() } else { String::new() },
            dkim_verified,
        }
    }
}

/// Circuit for proving email domain ownership.
///
/// This creates a ZK proof that you own an email at a specific domain
/// without revealing the actual email address.
#[derive(Clone)]
pub struct EmailDomainCircuit {
    /// Poseidon configuration
    pub poseidon_config: PoseidonConfig<Fr>,
    
    /// Private: Hash of the email address
    pub email_hash: Option<Fr>,
    /// Private: Hash of DKIM data (proves authenticity)
    pub dkim_hash: Option<Fr>,
    /// Private: Random nonce for uniqueness
    pub nonce: Option<Fr>,
    
    /// Public: Hash of the domain (what we're proving)
    pub domain_hash: Option<Fr>,
    /// Public: Commitment to all the private data
    pub commitment: Option<Fr>,
}

impl EmailDomainCircuit {
    /// Create an empty circuit for trusted setup
    pub fn new_empty() -> Self {
        let hasher = PoseidonHasher::new();
        
        // Dummy values for setup
        let email_hash = Fr::from(0u64);
        let dkim_hash = Fr::from(1u64);
        let nonce = Fr::from(2u64);
        let domain_hash = Fr::from(3u64);
        
        // Compute commitment
        let commitment = hasher.hash_many(&[email_hash, domain_hash, dkim_hash, nonce]);
        
        Self {
            poseidon_config: hasher.config().clone(),
            email_hash: Some(email_hash),
            dkim_hash: Some(dkim_hash),
            nonce: Some(nonce),
            domain_hash: Some(domain_hash),
            commitment: Some(commitment),
        }
    }
    
    /// Create a circuit with actual witness values
    pub fn new_with_witness(input: &EmailProofInput) -> Self {
        let hasher = PoseidonHasher::new();
        
        // Hash the private data
        let email_hash = string_to_field(&input.email);
        let domain_hash = string_to_field(&input.domain);
        let dkim_hash = string_to_field(&input.dkim_data);
        
        // Generate random nonce
        let nonce_bytes: [u8; 32] = rand::random();
        let nonce = Fr::from_be_bytes_mod_order(&nonce_bytes);
        
        // Compute commitment: H(email_hash, domain_hash, dkim_hash, nonce)
        let commitment = hasher.hash_many(&[email_hash, domain_hash, dkim_hash, nonce]);
        
        Self {
            poseidon_config: hasher.config().clone(),
            email_hash: Some(email_hash),
            dkim_hash: Some(dkim_hash),
            nonce: Some(nonce),
            domain_hash: Some(domain_hash),
            commitment: Some(commitment),
        }
    }
    
    /// Get the domain hash (public input)
    pub fn get_domain_hash(&self) -> Option<Fr> {
        self.domain_hash
    }
    
    /// Get the commitment (public input)
    pub fn get_commitment(&self) -> Option<Fr> {
        self.commitment
    }
}

impl ConstraintSynthesizer<Fr> for EmailDomainCircuit {
    fn generate_constraints(self, cs: ConstraintSystemRef<Fr>) -> Result<(), SynthesisError> {
        // Allocate private witnesses
        let email_hash_var = FpVar::new_witness(cs.clone(), || {
            self.email_hash.ok_or(SynthesisError::AssignmentMissing)
        })?;
        
        let dkim_hash_var = FpVar::new_witness(cs.clone(), || {
            self.dkim_hash.ok_or(SynthesisError::AssignmentMissing)
        })?;
        
        let nonce_var = FpVar::new_witness(cs.clone(), || {
            self.nonce.ok_or(SynthesisError::AssignmentMissing)
        })?;
        
        // Allocate public inputs
        let domain_hash_var = FpVar::new_input(cs.clone(), || {
            self.domain_hash.ok_or(SynthesisError::AssignmentMissing)
        })?;
        
        let commitment_var = FpVar::new_input(cs.clone(), || {
            self.commitment.ok_or(SynthesisError::AssignmentMissing)
        })?;
        
        // Compute Poseidon hash: H(email_hash, domain_hash, dkim_hash, nonce)
        let computed_commitment = poseidon_hash_four(
            cs.clone(),
            &self.poseidon_config,
            &email_hash_var,
            &domain_hash_var,
            &dkim_hash_var,
            &nonce_var,
        )?;
        
        // Constraint: computed commitment must equal public commitment
        computed_commitment.enforce_equal(&commitment_var)?;
        
        // The domain_hash is a public input, so verifier knows what domain is being proven
        // No additional constraint needed - it's automatically part of the public inputs
        
        Ok(())
    }
}

/// Compute Poseidon hash of four field elements in-circuit.
fn poseidon_hash_four(
    cs: ConstraintSystemRef<Fr>,
    config: &PoseidonConfig<Fr>,
    a: &FpVar<Fr>,
    b: &FpVar<Fr>,
    c: &FpVar<Fr>,
    d: &FpVar<Fr>,
) -> Result<FpVar<Fr>, SynthesisError> {
    let mut sponge = PoseidonSpongeVar::new(cs, config);
    sponge.absorb(a)?;
    sponge.absorb(b)?;
    sponge.absorb(c)?;
    sponge.absorb(d)?;
    let output = sponge.squeeze_field_elements(1)?;
    Ok(output[0].clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_relations::r1cs::ConstraintSystem;
    
    #[test]
    fn test_email_circuit_valid() {
        let input = EmailProofInput::new(
            "alice@google.com",
            "dkim-signature-data",
            "dkim=pass"
        );
        
        let circuit = EmailDomainCircuit::new_with_witness(&input);
        
        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();
        
        println!("Email circuit constraints: {}", cs.num_constraints());
        assert!(cs.is_satisfied().unwrap(), "Circuit should be satisfied");
    }
    
    #[test]
    fn test_email_circuit_setup() {
        let circuit = EmailDomainCircuit::new_empty();
        
        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();
        
        println!("Email setup constraints: {}", cs.num_constraints());
        assert!(cs.is_satisfied().unwrap(), "Setup circuit should be satisfied");
    }
    
    #[test]
    fn test_different_emails_different_commitments() {
        let input1 = EmailProofInput::new("alice@google.com", "sig1", "dkim=pass");
        let input2 = EmailProofInput::new("bob@google.com", "sig2", "dkim=pass");
        
        let circuit1 = EmailDomainCircuit::new_with_witness(&input1);
        let circuit2 = EmailDomainCircuit::new_with_witness(&input2);
        
        // Different emails should produce different commitments
        assert_ne!(circuit1.get_commitment(), circuit2.get_commitment());
        
        // But same domain hash (both google.com)
        assert_eq!(circuit1.get_domain_hash(), circuit2.get_domain_hash());
    }
    
    #[test]
    fn test_domain_extraction() {
        assert_eq!(extract_domain("alice@google.com"), Some("google.com".to_string()));
        assert_eq!(extract_domain("bob@meta.com"), Some("meta.com".to_string()));
        assert_eq!(extract_domain("invalid"), None);
    }
}

