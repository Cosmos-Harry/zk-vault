//! Groth16 proof verification for Merkle membership proofs.

use ark_bn254::{Bn254, Fr};
use ark_groth16::{Groth16, PreparedVerifyingKey, VerifyingKey};
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize};
use ark_snark::SNARK;
use std::path::Path;

use crate::prover::MembershipProof;

/// Result type for verifier operations.
pub type VerifierResult<T> = Result<T, VerifierError>;

/// Errors that can occur during verification.
#[derive(Debug, thiserror::Error)]
pub enum VerifierError {
    #[error("Verification failed: {0}")]
    VerificationFailed(String),

    #[error("Invalid proof format: {0}")]
    InvalidProof(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Root mismatch: proof is for a different tree")]
    RootMismatch,
}

/// Verifier for Merkle membership proofs.
pub struct Verifier {
    /// Prepared verifying key for fast verification.
    prepared_vk: PreparedVerifyingKey<Bn254>,
    /// Original verifying key (for serialization).
    verifying_key: VerifyingKey<Bn254>,
}

impl Verifier {
    /// Create a new verifier from a verifying key.
    pub fn new(vk: VerifyingKey<Bn254>) -> Self {
        let prepared_vk = Groth16::<Bn254>::process_vk(&vk).unwrap();
        Self {
            prepared_vk,
            verifying_key: vk,
        }
    }

    /// Verify a membership proof.
    ///
    /// Returns `true` if the proof is valid, `false` otherwise.
    pub fn verify(&self, proof: &MembershipProof) -> VerifierResult<bool> {
        let public_inputs = vec![proof.public_input];

        Groth16::<Bn254>::verify_with_processed_vk(&self.prepared_vk, &public_inputs, &proof.proof)
            .map_err(|e| VerifierError::VerificationFailed(e.to_string()))
    }

    /// Verify a proof against a specific Merkle root.
    ///
    /// This ensures the proof was generated for the expected tree.
    pub fn verify_with_root(&self, proof: &MembershipProof, expected_root: &Fr) -> VerifierResult<bool> {
        // Check that the proof's public input matches the expected root
        if &proof.public_input != expected_root {
            return Err(VerifierError::RootMismatch);
        }

        self.verify(proof)
    }

    /// Verify a proof from raw bytes.
    pub fn verify_bytes(&self, proof_bytes: &[u8]) -> VerifierResult<bool> {
        let proof = MembershipProof::from_bytes(proof_bytes)
            .map_err(|e| VerifierError::InvalidProof(e.to_string()))?;
        self.verify(&proof)
    }

    /// Get a reference to the verifying key.
    pub fn verifying_key(&self) -> &VerifyingKey<Bn254> {
        &self.verifying_key
    }

    /// Save verifying key to file.
    pub fn save(&self, path: &Path) -> VerifierResult<()> {
        let mut bytes = Vec::new();
        self.verifying_key
            .serialize_compressed(&mut bytes)
            .map_err(|e| VerifierError::SerializationError(e.to_string()))?;
        std::fs::write(path, bytes)?;
        Ok(())
    }

    /// Load verifier from file.
    pub fn load(path: &Path) -> VerifierResult<Self> {
        let bytes = std::fs::read(path)?;
        let vk = VerifyingKey::deserialize_compressed(&bytes[..])
            .map_err(|e| VerifierError::SerializationError(e.to_string()))?;
        Ok(Self::new(vk))
    }
}

/// Verification result with additional metadata.
#[derive(Debug, Clone)]
pub struct VerificationReport {
    /// Whether the proof is valid.
    pub is_valid: bool,
    /// The Merkle root the proof was verified against.
    pub merkle_root: Fr,
    /// Size of the proof in bytes.
    pub proof_size: usize,
}

impl Verifier {
    /// Verify and produce a detailed report.
    pub fn verify_with_report(&self, proof: &MembershipProof) -> VerifierResult<VerificationReport> {
        let is_valid = self.verify(proof)?;

        Ok(VerificationReport {
            is_valid,
            merkle_root: proof.public_input,
            proof_size: proof.size(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::merkle::tree::MerkleTree;
    use crate::prover::Prover;

    #[test]
    fn test_verify_valid_proof() {
        let leaves: Vec<Fr> = (0..8).map(|i| Fr::from(i as u64)).collect();
        let tree = MerkleTree::new(leaves);

        let (prover, vk) = Prover::setup(tree.depth()).unwrap();
        let verifier = Verifier::new(vk);

        let proof = prover.prove(&tree, &Fr::from(5u64)).unwrap();
        assert!(verifier.verify(&proof).unwrap());
    }

    #[test]
    fn test_verify_with_wrong_root() {
        let leaves: Vec<Fr> = (0..8).map(|i| Fr::from(i as u64)).collect();
        let tree = MerkleTree::new(leaves);

        let (prover, vk) = Prover::setup(tree.depth()).unwrap();
        let verifier = Verifier::new(vk);

        let proof = prover.prove(&tree, &Fr::from(5u64)).unwrap();

        // Verify against wrong root
        let wrong_root = Fr::from(999u64);
        let result = verifier.verify_with_root(&proof, &wrong_root);

        assert!(matches!(result, Err(VerifierError::RootMismatch)));
    }

    #[test]
    fn test_verification_report() {
        let leaves: Vec<Fr> = (0..4).map(|i| Fr::from(i as u64)).collect();
        let tree = MerkleTree::new(leaves);

        let (prover, vk) = Prover::setup(tree.depth()).unwrap();
        let verifier = Verifier::new(vk);

        let proof = prover.prove(&tree, &Fr::from(2u64)).unwrap();
        let report = verifier.verify_with_report(&proof).unwrap();

        assert!(report.is_valid);
        assert_eq!(report.merkle_root, tree.root());
        assert!(report.proof_size > 0);
    }
}


