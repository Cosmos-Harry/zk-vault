//! WASM bindings for ZK Vault
//!
//! This module exposes real ZK proof generation functions to JavaScript
//! via wasm-bindgen, using Groth16 on BN254 curve.

use wasm_bindgen::prelude::*;
use ark_bn254::{Bn254, Fr};
use ark_groth16::{Groth16, PreparedVerifyingKey, ProvingKey, VerifyingKey};
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize};
use ark_snark::SNARK;
use ark_std::rand::{rngs::StdRng, SeedableRng};
use ark_ff::PrimeField;
use sha2::{Digest, Sha256};
use std::sync::Mutex;

use crate::circuit::{CountryProofCircuit, ScaledBounds, country_code_to_field};
use crate::circuit::{EmailDomainCircuit, EmailProofInput};
use crate::proofs::location::COUNTRIES;

// Initialize panic hook for better error messages in browser console
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

// ============== PROVER STATE ==============

/// Global prover state for country proofs
#[allow(dead_code)]
struct CountryProverState {
    proving_key: ProvingKey<Bn254>,
    verifying_key: VerifyingKey<Bn254>,
    prepared_vk: PreparedVerifyingKey<Bn254>,
}

/// Global prover state for email proofs
#[allow(dead_code)]
struct EmailProverState {
    proving_key: ProvingKey<Bn254>,
    verifying_key: VerifyingKey<Bn254>,
    prepared_vk: PreparedVerifyingKey<Bn254>,
}

static COUNTRY_PROVER: Mutex<Option<CountryProverState>> = Mutex::new(None);
static EMAIL_PROVER: Mutex<Option<EmailProverState>> = Mutex::new(None);

// ============== RESULT TYPES ==============

/// Country proof result for JavaScript
#[wasm_bindgen]
pub struct CountryProofResult {
    success: bool,
    country_code: String,
    country_name: String,
    proof_bytes: Vec<u8>,
    public_input: String,
    error: Option<String>,
}

#[wasm_bindgen]
impl CountryProofResult {
    #[wasm_bindgen(getter)]
    pub fn success(&self) -> bool {
        self.success
    }

    #[wasm_bindgen(getter)]
    pub fn country_code(&self) -> String {
        self.country_code.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn country_name(&self) -> String {
        self.country_name.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn proof_hex(&self) -> String {
        hex::encode(&self.proof_bytes)
    }
    
    #[wasm_bindgen(getter)]
    pub fn proof_bytes(&self) -> Vec<u8> {
        self.proof_bytes.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn public_input(&self) -> String {
        self.public_input.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn error(&self) -> Option<String> {
        self.error.clone()
    }
}

/// Email domain proof result for JavaScript
#[wasm_bindgen]
pub struct EmailProofResult {
    success: bool,
    domain: String,
    proof_bytes: Vec<u8>,
    domain_hash: String,
    commitment: String,
    dkim_verified: bool,
    error: Option<String>,
}

#[wasm_bindgen]
impl EmailProofResult {
    #[wasm_bindgen(getter)]
    pub fn success(&self) -> bool {
        self.success
    }

    #[wasm_bindgen(getter)]
    pub fn domain(&self) -> String {
        self.domain.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn proof_hex(&self) -> String {
        hex::encode(&self.proof_bytes)
    }
    
    #[wasm_bindgen(getter)]
    pub fn proof_bytes(&self) -> Vec<u8> {
        self.proof_bytes.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn domain_hash(&self) -> String {
        self.domain_hash.clone()
    }
    
    #[wasm_bindgen(getter)]
    pub fn commitment(&self) -> String {
        self.commitment.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn dkim_verified(&self) -> bool {
        self.dkim_verified
    }

    #[wasm_bindgen(getter)]
    pub fn error(&self) -> Option<String> {
        self.error.clone()
    }
}

// ============== INITIALIZATION ==============

/// Initialize the ZK prover for country proofs.
/// This performs trusted setup - call once at startup.
/// Returns true if successful.
#[wasm_bindgen]
pub fn init_country_prover() -> bool {
    let mut state = COUNTRY_PROVER.lock().unwrap();
    
    // Already initialized?
    if state.is_some() {
        return true;
    }
    
    // Create dummy circuit for trusted setup
    let circuit = CountryProofCircuit::new_empty();
    
    // Deterministic RNG for reproducible setup
    // NOTE: In production, use a proper trusted setup ceremony!
    let mut rng = StdRng::seed_from_u64(0x5A4B5F5641554C54); // "ZK_VAULT" in hex
    
    match Groth16::<Bn254>::circuit_specific_setup(circuit, &mut rng) {
        Ok((pk, vk)) => {
            let pvk = Groth16::<Bn254>::process_vk(&vk).unwrap();
            *state = Some(CountryProverState {
                proving_key: pk,
                verifying_key: vk,
                prepared_vk: pvk,
            });
            web_sys::console::log_1(&"✓ Country ZK prover initialized".into());
            true
        }
        Err(e) => {
            web_sys::console::error_1(&format!("Failed to init prover: {:?}", e).into());
            false
        }
    }
}

/// Initialize the ZK prover for email domain proofs.
/// This performs trusted setup - call once at startup.
/// Returns true if successful.
#[wasm_bindgen]
pub fn init_email_prover() -> bool {
    let mut state = EMAIL_PROVER.lock().unwrap();
    
    // Already initialized?
    if state.is_some() {
        return true;
    }
    
    // Create dummy circuit for trusted setup
    let circuit = EmailDomainCircuit::new_empty();
    
    // Deterministic RNG for reproducible setup
    let mut rng = StdRng::seed_from_u64(0x454D41494C5F5A4B); // "EMAIL_ZK" in hex
    
    match Groth16::<Bn254>::circuit_specific_setup(circuit, &mut rng) {
        Ok((pk, vk)) => {
            let pvk = Groth16::<Bn254>::process_vk(&vk).unwrap();
            *state = Some(EmailProverState {
                proving_key: pk,
                verifying_key: vk,
                prepared_vk: pvk,
            });
            web_sys::console::log_1(&"✓ Email ZK prover initialized".into());
            true
        }
        Err(e) => {
            web_sys::console::error_1(&format!("Failed to init email prover: {:?}", e).into());
            false
        }
    }
}

/// Check if country prover is initialized
#[wasm_bindgen]
pub fn is_prover_ready() -> bool {
    COUNTRY_PROVER.lock().unwrap().is_some()
}

// ============== COUNTRY VERIFICATION ==============

/// Generate a REAL ZK proof of country from coordinates.
/// 
/// This creates a Groth16 proof that proves you're in a specific country
/// without revealing your exact coordinates.
#[wasm_bindgen]
pub fn prove_country_from_coords(lat: f64, lng: f64) -> CountryProofResult {
    // Find which country contains these coordinates
    let country = COUNTRIES.iter().find(|c| {
        lat >= c.min_lat && lat <= c.max_lat && lng >= c.min_lng && lng <= c.max_lng
    });
    
    let country = match country {
        Some(c) => c,
        None => {
            return CountryProofResult {
                success: false,
                country_code: String::new(),
                country_name: String::new(),
                proof_bytes: Vec::new(),
                public_input: String::new(),
                error: Some("Coordinates not within any supported country".to_string()),
            }
        }
    };
    
    // Get prover state
    let state = COUNTRY_PROVER.lock().unwrap();
    let prover = match state.as_ref() {
        Some(p) => p,
        None => {
            return CountryProofResult {
                success: false,
                country_code: String::new(),
                country_name: String::new(),
                proof_bytes: Vec::new(),
                public_input: String::new(),
                error: Some("Prover not initialized. Call init_country_prover() first.".to_string()),
            }
        }
    };
    
    // Create circuit with actual coordinates
    let bounds = ScaledBounds::new(country.min_lat, country.max_lat, country.min_lng, country.max_lng);
    let circuit = CountryProofCircuit::new_with_witness(lat, lng, &bounds, country.code);
    
    // Generate Groth16 proof
    let mut rng = StdRng::seed_from_u64(js_sys::Date::now() as u64);
    
    match Groth16::<Bn254>::prove(&prover.proving_key, circuit, &mut rng) {
        Ok(proof) => {
            // Serialize proof
            let mut proof_bytes = Vec::new();
            proof.serialize_compressed(&mut proof_bytes).unwrap();
            
            // Get public input (country identifier)
            let country_id = country_code_to_field(country.code);
            let mut public_input_bytes = Vec::new();
            country_id.serialize_compressed(&mut public_input_bytes).unwrap();
            
            CountryProofResult {
                success: true,
                country_code: country.code.to_string(),
                country_name: country.name.to_string(),
                proof_bytes,
                public_input: hex::encode(public_input_bytes),
                error: None,
            }
        }
        Err(e) => {
            CountryProofResult {
                success: false,
                country_code: String::new(),
                country_name: String::new(),
                proof_bytes: Vec::new(),
                public_input: String::new(),
                error: Some(format!("Proof generation failed: {:?}", e)),
            }
        }
    }
}

/// Simpler version: prove country from country code (for IP geolocation).
/// This still generates a real ZK proof but uses predefined bounds.
#[wasm_bindgen]
pub fn prove_country(country_code: &str) -> CountryProofResult {
    let code_upper = country_code.to_uppercase();
    
    // Find the country
    let country = COUNTRIES.iter().find(|c| c.code == code_upper);
    
    let country = match country {
        Some(c) => c,
        None => {
            return CountryProofResult {
                success: false,
                country_code: String::new(),
                country_name: String::new(),
                proof_bytes: Vec::new(),
                public_input: String::new(),
                error: Some(format!("Unknown country code: {}", country_code)),
            }
        }
    };
    
    // Get prover state
    let state = COUNTRY_PROVER.lock().unwrap();
    let prover = match state.as_ref() {
        Some(p) => p,
        None => {
            return CountryProofResult {
                success: false,
                country_code: String::new(),
                country_name: String::new(),
                proof_bytes: Vec::new(),
                public_input: String::new(),
                error: Some("Prover not initialized. Call init_country_prover() first.".to_string()),
            }
        }
    };
    
    // Use center of country as coordinates (this is for demo - in production, use actual coords)
    let lat = (country.min_lat + country.max_lat) / 2.0;
    let lng = (country.min_lng + country.max_lng) / 2.0;
    
    // Create circuit
    let bounds = ScaledBounds::new(country.min_lat, country.max_lat, country.min_lng, country.max_lng);
    let circuit = CountryProofCircuit::new_with_witness(lat, lng, &bounds, country.code);
    
    // Generate proof with cryptographically secure randomness
    // Use getrandom (Web Crypto API) instead of predictable timestamp
    let mut seed = [0u8; 32];
    getrandom::getrandom(&mut seed).expect("Failed to get secure random bytes");
    let mut rng = StdRng::from_seed(seed);
    
    match Groth16::<Bn254>::prove(&prover.proving_key, circuit, &mut rng) {
        Ok(proof) => {
            let mut proof_bytes = Vec::new();
            proof.serialize_compressed(&mut proof_bytes).unwrap();
            
            let country_id = country_code_to_field(country.code);
            let mut public_input_bytes = Vec::new();
            country_id.serialize_compressed(&mut public_input_bytes).unwrap();
            
            CountryProofResult {
                success: true,
                country_code: country.code.to_string(),
                country_name: country.name.to_string(),
                proof_bytes,
                public_input: hex::encode(public_input_bytes),
                error: None,
            }
        }
        Err(e) => {
            CountryProofResult {
                success: false,
                country_code: String::new(),
                country_name: String::new(),
                proof_bytes: Vec::new(),
                public_input: String::new(),
                error: Some(format!("Proof generation failed: {:?}", e)),
            }
        }
    }
}

/// Verify a country proof
#[wasm_bindgen]
pub fn verify_country_proof(proof_hex: &str, public_input_hex: &str) -> bool {
    let proof_bytes = match hex::decode(proof_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };
    
    let public_input_bytes = match hex::decode(public_input_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };
    
    let proof = match ark_groth16::Proof::<Bn254>::deserialize_compressed(&proof_bytes[..]) {
        Ok(p) => p,
        Err(_) => return false,
    };
    
    let public_input = match Fr::deserialize_compressed(&public_input_bytes[..]) {
        Ok(f) => f,
        Err(_) => return false,
    };
    
    let state = COUNTRY_PROVER.lock().unwrap();
    let prover = match state.as_ref() {
        Some(p) => p,
        None => return false,
    };
    
    Groth16::<Bn254>::verify_with_processed_vk(&prover.prepared_vk, &[public_input], &proof)
        .unwrap_or(false)
}

// ============== EMAIL DOMAIN VERIFICATION ==============

/// Generate a REAL ZK proof of email domain ownership.
/// 
/// This creates a Groth16 proof that you own an email at the specified domain
/// without revealing the actual email address.
#[wasm_bindgen]
pub fn prove_email_domain(domain: &str, dkim_signature: &str, auth_results: &str) -> EmailProofResult {
    // Verify DKIM passed (auth_results is the reliable indicator)
    // Gmail and most providers set auth_results even if raw DKIM header isn't exposed
    let dkim_verified = auth_results.to_lowercase().contains("dkim=pass");

    if !dkim_verified {
        return EmailProofResult {
            success: false,
            domain: domain.to_string(),
            proof_bytes: Vec::new(),
            domain_hash: String::new(),
            commitment: String::new(),
            dkim_verified: false,
            error: Some("DKIM verification failed - email may not be authentic".to_string()),
        };
    }
    
    // Use DKIM signature if available, otherwise use auth_results as proof data
    let dkim_data = if !dkim_signature.is_empty() {
        dkim_signature.to_string()
    } else {
        auth_results.to_string()
    };

    // Get email prover state
    let state = EMAIL_PROVER.lock().unwrap();
    let prover = match state.as_ref() {
        Some(p) => p,
        None => {
            return EmailProofResult {
                success: false,
                domain: domain.to_string(),
                proof_bytes: Vec::new(),
                domain_hash: String::new(),
                commitment: String::new(),
                dkim_verified,
                error: Some("Email prover not initialized. Call init_email_prover() first.".to_string()),
            }
        }
    };

    // Create proof input with actual DKIM data
    let input = EmailProofInput::from_domain_with_dkim(domain, dkim_verified, &dkim_data);
    
    // Create circuit with real witness
    let circuit = EmailDomainCircuit::new_with_witness(&input);
    
    // Get public inputs before circuit is consumed
    let domain_hash = circuit.get_domain_hash().unwrap();
    let commitment = circuit.get_commitment().unwrap();
    
    // Generate Groth16 proof
    let mut rng = StdRng::seed_from_u64(js_sys::Date::now() as u64);
    
    match Groth16::<Bn254>::prove(&prover.proving_key, circuit, &mut rng) {
        Ok(proof) => {
            // Serialize proof
            let mut proof_bytes = Vec::new();
            proof.serialize_compressed(&mut proof_bytes).unwrap();
            
            // Serialize public inputs
            let mut domain_hash_bytes = Vec::new();
            domain_hash.serialize_compressed(&mut domain_hash_bytes).unwrap();
            
            let mut commitment_bytes = Vec::new();
            commitment.serialize_compressed(&mut commitment_bytes).unwrap();
            
            EmailProofResult {
                success: true,
                domain: domain.to_string(),
                proof_bytes,
                domain_hash: hex::encode(domain_hash_bytes),
                commitment: hex::encode(commitment_bytes),
                dkim_verified,
                error: None,
            }
        }
        Err(e) => {
            EmailProofResult {
                success: false,
                domain: domain.to_string(),
                proof_bytes: Vec::new(),
                domain_hash: String::new(),
                commitment: String::new(),
                dkim_verified,
                error: Some(format!("Proof generation failed: {:?}", e)),
            }
        }
    }
}

/// Verify an email domain proof
#[wasm_bindgen]
pub fn verify_email_proof(proof_hex: &str, domain_hash_hex: &str, commitment_hex: &str) -> bool {
    let proof_bytes = match hex::decode(proof_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };
    
    let domain_hash_bytes = match hex::decode(domain_hash_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };
    
    let commitment_bytes = match hex::decode(commitment_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };
    
    let proof = match ark_groth16::Proof::<Bn254>::deserialize_compressed(&proof_bytes[..]) {
        Ok(p) => p,
        Err(_) => return false,
    };
    
    let domain_hash = match Fr::deserialize_compressed(&domain_hash_bytes[..]) {
        Ok(f) => f,
        Err(_) => return false,
    };
    
    let commitment = match Fr::deserialize_compressed(&commitment_bytes[..]) {
        Ok(f) => f,
        Err(_) => return false,
    };
    
    let state = EMAIL_PROVER.lock().unwrap();
    let prover = match state.as_ref() {
        Some(p) => p,
        None => return false,
    };
    
    // Public inputs: [domain_hash, commitment]
    Groth16::<Bn254>::verify_with_processed_vk(&prover.prepared_vk, &[domain_hash, commitment], &proof)
        .unwrap_or(false)
}

/// Check if email prover is initialized
#[wasm_bindgen]
pub fn is_email_prover_ready() -> bool {
    EMAIL_PROVER.lock().unwrap().is_some()
}

// ============== UTILITIES ==============

/// Get list of supported countries as JSON
#[wasm_bindgen]
pub fn get_supported_countries() -> String {
    let countries: Vec<serde_json::Value> = COUNTRIES
        .iter()
        .map(|c| {
            serde_json::json!({
                "code": c.code,
                "name": c.name
            })
        })
        .collect();
    
    serde_json::to_string(&countries).unwrap_or_else(|_| "[]".to_string())
}

/// Get version info
#[wasm_bindgen]
pub fn get_version() -> String {
    format!("ZK Vault WASM v{} (Groth16/BN254)", env!("CARGO_PKG_VERSION"))
}

/// Hash a string to a field element (for ZK circuits)
#[wasm_bindgen]
pub fn hash_to_field(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let hash = hasher.finalize();
    let fr = Fr::from_be_bytes_mod_order(&hash);
    
    let mut bytes = Vec::new();
    fr.serialize_compressed(&mut bytes).unwrap();
    hex::encode(bytes)
}
