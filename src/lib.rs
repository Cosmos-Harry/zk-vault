//! ZK Chat - Prove your identity without revealing it
//!
//! A zero-knowledge proof platform for verifying:
//! - Email domain ownership (e.g., "I work at @google.com")
//! - Location/country (e.g., "I'm in the USA")
//! - More coming soon!
//!
//! # Architecture
//!
//! 1. User provides credential (email file, GPS coordinates)
//! 2. ZK circuit verifies credential locally
//! 3. Proof generated - reveals only what you choose
//! 4. Share proof anonymously

pub mod circuit;
pub mod merkle;
pub mod proofs;
pub mod prover;
pub mod verifier;

// WASM bindings (only compiled when wasm feature is enabled)
#[cfg(feature = "wasm")]
pub mod wasm;

// Re-export main types
pub use prover::Prover;
pub use verifier::Verifier;

/// Supported proof types
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum ProofType {
    /// Proves ownership of email at a specific domain
    EmailDomain { domain: String },
    /// Proves location within a country
    Country { country_code: String },
}

/// A verified proof that can be shared
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VerifiedProof {
    /// Type of proof
    pub proof_type: ProofType,
    /// The cryptographic proof (serialized)
    pub proof_data: Vec<u8>,
    /// Timestamp when proof was generated
    pub generated_at: u64,
    /// Optional expiry
    pub expires_at: Option<u64>,
}
