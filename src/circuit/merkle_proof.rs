//! Merkle proof circuit for proving membership in a password breach database.
//!
//! This circuit proves knowledge of:
//! - A leaf value (password hash)
//! - A valid Merkle path from that leaf to a known root
//!
//! Without revealing the actual password hash.

use ark_bn254::Fr;
use ark_crypto_primitives::sponge::{
    poseidon::{constraints::PoseidonSpongeVar, PoseidonConfig},
    constraints::CryptographicSpongeVar,
};
use ark_r1cs_std::{
    alloc::AllocVar,
    boolean::Boolean,
    eq::EqGadget,
    fields::fp::FpVar,
    select::CondSelectGadget,
};
use ark_relations::r1cs::{ConstraintSynthesizer, ConstraintSystemRef, SynthesisError};
use ark_std::vec::Vec;

use crate::merkle::hash::PoseidonHasher;
use crate::merkle::tree::MerklePath;

/// Circuit for proving Merkle tree membership.
///
/// Public inputs:
/// - `root`: The Merkle tree root
///
/// Private witnesses:
/// - `leaf`: The leaf value (password hash as field element)
/// - `path`: Sibling hashes along the path
/// - `path_indices`: Direction indicators (false=left, true=right)
#[derive(Clone)]
pub struct MerkleProofCircuit {
    /// Poseidon configuration for hashing.
    pub poseidon_config: PoseidonConfig<Fr>,

    /// Private: The leaf value being proven.
    pub leaf: Option<Fr>,

    /// Private: Sibling hashes along the Merkle path.
    pub path: Vec<Option<Fr>>,

    /// Private: Path direction indicators.
    pub path_indices: Vec<Option<bool>>,

    /// Public: The Merkle root to verify against.
    pub root: Option<Fr>,
}

impl MerkleProofCircuit {
    /// Create a new circuit with the given tree depth.
    ///
    /// Uses dummy zero values for the trusted setup phase.
    /// The setup only needs to know the circuit structure, not actual values.
    pub fn new_empty(depth: usize) -> Self {
        let hasher = PoseidonHasher::new();
        
        // Use dummy values for setup - the structure matters, not the values
        let dummy_leaf = Fr::from(0u64);
        let dummy_path: Vec<Option<Fr>> = (0..depth).map(|_| Some(Fr::from(0u64))).collect();
        let dummy_indices: Vec<Option<bool>> = (0..depth).map(|_| Some(false)).collect();
        
        // Compute a valid dummy root
        let mut current = dummy_leaf;
        for sibling in dummy_path.iter() {
            current = hasher.hash_two(&current, &sibling.unwrap());
        }
        
        Self {
            poseidon_config: hasher.config().clone(),
            leaf: Some(dummy_leaf),
            path: dummy_path,
            path_indices: dummy_indices,
            root: Some(current),
        }
    }

    /// Create a circuit with actual witness values for proving.
    pub fn new_with_witness(merkle_path: &MerklePath, root: Fr) -> Self {
        let hasher = PoseidonHasher::new();
        Self {
            poseidon_config: hasher.config().clone(),
            leaf: Some(merkle_path.leaf),
            path: merkle_path.siblings.iter().map(|s| Some(*s)).collect(),
            path_indices: merkle_path.indices.iter().map(|i| Some(*i)).collect(),
            root: Some(root),
        }
    }

    /// Create a circuit from a Merkle tree and leaf index.
    pub fn from_tree(
        tree: &crate::merkle::tree::MerkleTree,
        leaf_index: usize,
    ) -> Option<Self> {
        let path = tree.get_path(leaf_index)?;
        Some(Self::new_with_witness(&path, tree.root()))
    }

    /// Get the depth of this circuit.
    pub fn depth(&self) -> usize {
        self.path.len()
    }
}

impl ConstraintSynthesizer<Fr> for MerkleProofCircuit {
    fn generate_constraints(self, cs: ConstraintSystemRef<Fr>) -> Result<(), SynthesisError> {
        // Allocate the leaf as a private witness
        let leaf_var = FpVar::new_witness(cs.clone(), || {
            self.leaf.ok_or(SynthesisError::AssignmentMissing)
        })?;

        // Allocate the Merkle root as a public input
        let root_var = FpVar::new_input(cs.clone(), || {
            self.root.ok_or(SynthesisError::AssignmentMissing)
        })?;

        // Allocate path siblings as private witnesses
        let path_vars: Vec<FpVar<Fr>> = self
            .path
            .iter()
            .map(|sibling| {
                FpVar::new_witness(cs.clone(), || {
                    sibling.ok_or(SynthesisError::AssignmentMissing)
                })
            })
            .collect::<Result<Vec<_>, _>>()?;

        // Allocate path indices as private witnesses
        let index_vars: Vec<Boolean<Fr>> = self
            .path_indices
            .iter()
            .map(|idx| {
                Boolean::new_witness(cs.clone(), || {
                    idx.ok_or(SynthesisError::AssignmentMissing)
                })
            })
            .collect::<Result<Vec<_>, _>>()?;

        // Compute the root from the leaf and path using Poseidon hash
        let mut current = leaf_var;

        for (sibling, is_right) in path_vars.iter().zip(index_vars.iter()) {
            // If is_right is true, current is right child: hash(sibling, current)
            // If is_right is false, current is left child: hash(current, sibling)
            let left = FpVar::conditionally_select(is_right, sibling, &current)?;
            let right = FpVar::conditionally_select(is_right, &current, sibling)?;

            // Hash the two children using Poseidon
            current = poseidon_hash_two(cs.clone(), &self.poseidon_config, &left, &right)?;
        }

        // Enforce that the computed root equals the public input root
        current.enforce_equal(&root_var)?;

        Ok(())
    }
}

/// Compute Poseidon hash of two field elements in-circuit.
fn poseidon_hash_two(
    cs: ConstraintSystemRef<Fr>,
    config: &PoseidonConfig<Fr>,
    left: &FpVar<Fr>,
    right: &FpVar<Fr>,
) -> Result<FpVar<Fr>, SynthesisError> {
    let mut sponge = PoseidonSpongeVar::new(cs, config);
    sponge.absorb(left)?;
    sponge.absorb(right)?;
    let output = sponge.squeeze_field_elements(1)?;
    Ok(output[0].clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_relations::r1cs::ConstraintSystem;
    use crate::merkle::tree::MerkleTree;

    #[test]
    fn test_circuit_satisfiability() {
        // Create a simple tree
        let leaves: Vec<Fr> = (0..8).map(|i| Fr::from(i as u64)).collect();
        let tree = MerkleTree::new(leaves);

        // Create circuit for leaf at index 3
        let circuit = MerkleProofCircuit::from_tree(&tree, 3).unwrap();

        // Check that constraints are satisfied
        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();

        assert!(cs.is_satisfied().unwrap());
        println!("Number of constraints: {}", cs.num_constraints());
    }

    #[test]
    fn test_circuit_with_wrong_root_fails() {
        // Create a simple tree
        let leaves: Vec<Fr> = (0..8).map(|i| Fr::from(i as u64)).collect();
        let tree = MerkleTree::new(leaves);

        // Create circuit with wrong root
        let path = tree.get_path(3).unwrap();
        let wrong_root = Fr::from(999u64);
        let circuit = MerkleProofCircuit::new_with_witness(&path, wrong_root);

        // Constraints should not be satisfied
        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();

        assert!(!cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_empty_circuit_for_setup() {
        // Create circuit with dummy values for trusted setup
        // Setup requires actual values, not None
        let leaves: Vec<Fr> = (0..8).map(|i| Fr::from(i as u64)).collect();
        let tree = MerkleTree::new(leaves);
        let circuit = MerkleProofCircuit::from_tree(&tree, 0).unwrap();

        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();

        // Should have allocated all variables
        println!("Number of constraints: {}", cs.num_constraints());
        println!("Number of variables: {}", cs.num_instance_variables() + cs.num_witness_variables());
    }
}

