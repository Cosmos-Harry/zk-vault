//! Groth16 proof generation for Merkle membership proofs.

use ark_bn254::{Bn254, Fr};
use ark_groth16::{Groth16, PreparedVerifyingKey, ProvingKey, VerifyingKey};
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize};
use ark_snark::SNARK;
use ark_std::rand::{rngs::StdRng, SeedableRng};
use std::path::Path;

use crate::circuit::MerkleProofCircuit;
use crate::merkle::tree::{MerkleTree, MerklePath};

/// Result type for prover operations.
pub type ProverResult<T> = Result<T, ProverError>;

/// Errors that can occur during proving.
#[derive(Debug, thiserror::Error)]
pub enum ProverError {
    #[error("Trusted setup failed: {0}")]
    SetupFailed(String),

    #[error("Proof generation failed: {0}")]
    ProofGenerationFailed(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Leaf not found in tree")]
    LeafNotFound,
}

/// Groth16 proof for Merkle membership.
#[derive(Clone)]
pub struct MembershipProof {
    /// The Groth16 proof.
    pub proof: ark_groth16::Proof<Bn254>,
    /// The public input (Merkle root).
    pub public_input: Fr,
}

impl MembershipProof {
    /// Serialize proof to bytes.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        self.proof.serialize_compressed(&mut bytes).unwrap();
        self.public_input.serialize_compressed(&mut bytes).unwrap();
        bytes
    }

    /// Deserialize proof from bytes.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, ProverError> {
        // Deserialize proof first (variable size due to compression)
        let proof = ark_groth16::Proof::<Bn254>::deserialize_compressed(bytes)
            .map_err(|e| ProverError::SerializationError(e.to_string()))?;
        
        // Get the size of the serialized proof
        let mut proof_bytes = Vec::new();
        proof.serialize_compressed(&mut proof_bytes).unwrap();
        let proof_size = proof_bytes.len();
        
        // Deserialize public input from remaining bytes
        let public_input = Fr::deserialize_compressed(&bytes[proof_size..])
            .map_err(|e| ProverError::SerializationError(e.to_string()))?;
        
        Ok(Self { proof, public_input })
    }

    /// Get the actual size of this proof in bytes.
    pub fn size(&self) -> usize {
        self.to_bytes().len()
    }
}

/// Prover for generating Merkle membership proofs.
pub struct Prover {
    /// Groth16 proving key.
    proving_key: ProvingKey<Bn254>,
    /// Tree depth this prover was set up for.
    depth: usize,
}

impl Prover {
    /// Perform trusted setup for a given tree depth.
    ///
    /// This generates the proving and verifying keys.
    /// In production, this should use a secure multi-party computation.
    pub fn setup(depth: usize) -> ProverResult<(Self, VerifyingKey<Bn254>)> {
        // Create a dummy circuit for setup
        let circuit = MerkleProofCircuit::new_empty(depth);

        // Use a deterministic RNG for reproducibility (NOT secure for production!)
        let mut rng = StdRng::seed_from_u64(0xDEADBEEF);

        let (pk, vk) = Groth16::<Bn254>::circuit_specific_setup(circuit, &mut rng)
            .map_err(|e| ProverError::SetupFailed(e.to_string()))?;

        Ok((Self { proving_key: pk, depth }, vk))
    }

    /// Generate a proof that a password hash exists in the Merkle tree.
    pub fn prove(&self, tree: &MerkleTree, leaf: &Fr) -> ProverResult<MembershipProof> {
        // Find the leaf in the tree
        let leaf_index = tree
            .find_leaf(leaf)
            .ok_or(ProverError::LeafNotFound)?;

        // Get the Merkle path
        let path = tree
            .get_path(leaf_index)
            .ok_or(ProverError::LeafNotFound)?;

        self.prove_with_path(&path, tree.root())
    }

    /// Generate a proof given a pre-computed Merkle path.
    pub fn prove_with_path(&self, path: &MerklePath, root: Fr) -> ProverResult<MembershipProof> {
        // Create the circuit with witness values
        let circuit = MerkleProofCircuit::new_with_witness(path, root);

        // Ensure path depth matches prover setup
        if circuit.depth() != self.depth {
            return Err(ProverError::ProofGenerationFailed(format!(
                "Path depth {} doesn't match prover setup depth {}",
                circuit.depth(),
                self.depth
            )));
        }

        // Generate the proof
        let mut rng = StdRng::seed_from_u64(0xCAFEBABE);
        let proof = Groth16::<Bn254>::prove(&self.proving_key, circuit, &mut rng)
            .map_err(|e| ProverError::ProofGenerationFailed(e.to_string()))?;

        Ok(MembershipProof {
            proof,
            public_input: root,
        })
    }

    /// Get the tree depth this prover was set up for.
    pub fn depth(&self) -> usize {
        self.depth
    }

    /// Save proving key to file.
    pub fn save_proving_key(&self, path: &Path) -> ProverResult<()> {
        let mut bytes = Vec::new();
        self.proving_key
            .serialize_compressed(&mut bytes)
            .map_err(|e| ProverError::SerializationError(e.to_string()))?;

        // Prepend depth as 4 bytes
        let mut file_bytes = (self.depth as u32).to_le_bytes().to_vec();
        file_bytes.extend(bytes);

        std::fs::write(path, file_bytes)?;
        Ok(())
    }

    /// Load proving key from file.
    pub fn load_proving_key(path: &Path) -> ProverResult<Self> {
        let bytes = std::fs::read(path)?;

        let depth = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
        let pk = ProvingKey::deserialize_compressed(&bytes[4..])
            .map_err(|e| ProverError::SerializationError(e.to_string()))?;

        Ok(Self {
            proving_key: pk,
            depth,
        })
    }
}

/// Save verifying key to file.
pub fn save_verifying_key(vk: &VerifyingKey<Bn254>, path: &Path) -> ProverResult<()> {
    let mut bytes = Vec::new();
    vk.serialize_compressed(&mut bytes)
        .map_err(|e| ProverError::SerializationError(e.to_string()))?;
    std::fs::write(path, bytes)?;
    Ok(())
}

/// Load verifying key from file.
pub fn load_verifying_key(path: &Path) -> ProverResult<VerifyingKey<Bn254>> {
    let bytes = std::fs::read(path)?;
    VerifyingKey::deserialize_compressed(&bytes[..])
        .map_err(|e| ProverError::SerializationError(e.to_string()))
}

/// Prepare verifying key for faster verification.
pub fn prepare_verifying_key(vk: &VerifyingKey<Bn254>) -> PreparedVerifyingKey<Bn254> {
    Groth16::<Bn254>::process_vk(vk).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::merkle::tree::MerkleTree;

    #[test]
    fn test_setup_and_prove() {
        // Create a small tree
        let leaves: Vec<Fr> = (0..8).map(|i| Fr::from(i as u64)).collect();
        let tree = MerkleTree::new(leaves);

        // Setup prover for tree depth
        let (prover, vk) = Prover::setup(tree.depth()).unwrap();

        // Generate proof for leaf at index 3
        let leaf = Fr::from(3u64);
        let proof = prover.prove(&tree, &leaf).unwrap();

        // Verify using Groth16
        let pvk = prepare_verifying_key(&vk);
        let public_inputs = vec![proof.public_input];
        let valid = Groth16::<Bn254>::verify_with_processed_vk(&pvk, &public_inputs, &proof.proof)
            .unwrap();

        assert!(valid);
    }

    #[test]
    fn test_proof_serialization() {
        let leaves: Vec<Fr> = (0..4).map(|i| Fr::from(i as u64)).collect();
        let tree = MerkleTree::new(leaves);

        let (prover, _vk) = Prover::setup(tree.depth()).unwrap();
        let proof = prover.prove(&tree, &Fr::from(2u64)).unwrap();

        // Serialize and deserialize
        let bytes = proof.to_bytes();
        let restored = MembershipProof::from_bytes(&bytes).unwrap();

        assert_eq!(proof.public_input, restored.public_input);
    }
}

