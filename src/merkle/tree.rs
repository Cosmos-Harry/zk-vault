//! Merkle tree implementation for password hash membership proofs.
//!
//! Uses Poseidon hash for ZK-friendly internal node computation.

use ark_bn254::Fr;
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize};
use ark_std::vec::Vec;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::hash::PoseidonHasher;

/// Maximum tree depth (2^30 > 1 billion leaves, enough for HIBP dataset).
pub const MAX_DEPTH: usize = 30;

/// A Merkle path (proof) for membership verification.
#[derive(Clone, Debug)]
pub struct MerklePath {
    /// Sibling hashes along the path from leaf to root.
    pub siblings: Vec<Fr>,
    /// Path indices: false = left child, true = right child.
    pub indices: Vec<bool>,
    /// The leaf value being proven.
    pub leaf: Fr,
}

impl MerklePath {
    /// Verify this path against a given root.
    pub fn verify(&self, root: &Fr, hasher: &PoseidonHasher) -> bool {
        let computed_root = self.compute_root(hasher);
        &computed_root == root
    }

    /// Compute the root from this path.
    pub fn compute_root(&self, hasher: &PoseidonHasher) -> Fr {
        let mut current = self.leaf;

        for (sibling, is_right) in self.siblings.iter().zip(self.indices.iter()) {
            current = if *is_right {
                // Current node is right child
                hasher.hash_two(sibling, &current)
            } else {
                // Current node is left child
                hasher.hash_two(&current, sibling)
            };
        }

        current
    }

    /// Get the depth of this path.
    pub fn depth(&self) -> usize {
        self.siblings.len()
    }
}

/// Binary Merkle tree with Poseidon hash.
#[derive(Clone)]
pub struct MerkleTree {
    /// All nodes stored in a flat array (level-order).
    /// Level 0 = root, Level depth = leaves.
    nodes: Vec<Fr>,
    /// Tree depth (number of levels below root).
    depth: usize,
    /// Number of leaves.
    num_leaves: usize,
    /// Hasher instance.
    hasher: PoseidonHasher,
    /// Map from leaf value to index (for fast lookups).
    leaf_index: HashMap<[u8; 32], usize>,
}

/// Serializable tree data (without hasher and index).
#[derive(Serialize, Deserialize)]
pub struct MerkleTreeData {
    nodes: Vec<[u8; 32]>,
    depth: usize,
    num_leaves: usize,
}

impl MerkleTree {
    /// Build a new Merkle tree from a list of leaves.
    ///
    /// The tree is padded to the next power of 2 with zero leaves.
    pub fn new(leaves: Vec<Fr>) -> Self {
        let hasher = PoseidonHasher::new();
        Self::with_hasher(leaves, hasher)
    }

    /// Build a tree with a specific hasher instance.
    pub fn with_hasher(leaves: Vec<Fr>, hasher: PoseidonHasher) -> Self {
        if leaves.is_empty() {
            return Self::empty_tree(hasher);
        }

        let num_leaves = leaves.len();
        let depth = Self::compute_depth(num_leaves);
        let padded_size = 1 << depth;

        // Pad leaves to power of 2
        let mut padded_leaves = leaves;
        padded_leaves.resize(padded_size, Fr::from(0u64));

        // Build tree bottom-up
        let total_nodes = 2 * padded_size - 1;
        let mut nodes = vec![Fr::from(0u64); total_nodes];

        // Copy leaves to the last level
        let leaf_start = padded_size - 1;
        for (i, leaf) in padded_leaves.iter().enumerate() {
            nodes[leaf_start + i] = *leaf;
        }

        // Build internal nodes (bottom-up)
        for i in (0..leaf_start).rev() {
            let left_child = 2 * i + 1;
            let right_child = 2 * i + 2;
            nodes[i] = hasher.hash_two(&nodes[left_child], &nodes[right_child]);
        }

        // Build leaf index
        let mut leaf_index = HashMap::new();
        for (i, leaf) in padded_leaves.iter().enumerate() {
            if i < num_leaves {
                let mut bytes = [0u8; 32];
                leaf.serialize_compressed(&mut bytes[..]).ok();
                leaf_index.insert(bytes, i);
            }
        }

        Self {
            nodes,
            depth,
            num_leaves,
            hasher,
            leaf_index,
        }
    }

    /// Create an empty tree.
    fn empty_tree(hasher: PoseidonHasher) -> Self {
        Self {
            nodes: vec![Fr::from(0u64)],
            depth: 0,
            num_leaves: 0,
            hasher,
            leaf_index: HashMap::new(),
        }
    }

    /// Compute the minimum depth needed for n leaves.
    fn compute_depth(n: usize) -> usize {
        if n <= 1 {
            return 1;
        }
        (n - 1).ilog2() as usize + 1
    }

    /// Get the Merkle root.
    pub fn root(&self) -> Fr {
        self.nodes[0]
    }

    /// Get tree depth.
    pub fn depth(&self) -> usize {
        self.depth
    }

    /// Get number of actual (non-padding) leaves.
    pub fn num_leaves(&self) -> usize {
        self.num_leaves
    }

    /// Get a reference to the hasher.
    pub fn hasher(&self) -> &PoseidonHasher {
        &self.hasher
    }

    /// Check if a leaf exists in the tree and return its index.
    pub fn find_leaf(&self, leaf: &Fr) -> Option<usize> {
        let mut bytes = [0u8; 32];
        leaf.serialize_compressed(&mut bytes[..]).ok()?;
        self.leaf_index.get(&bytes).copied()
    }

    /// Check if a leaf exists in the tree.
    pub fn contains(&self, leaf: &Fr) -> bool {
        self.find_leaf(leaf).is_some()
    }

    /// Generate a Merkle path for a leaf at the given index.
    pub fn get_path(&self, leaf_index: usize) -> Option<MerklePath> {
        if leaf_index >= self.num_leaves {
            return None;
        }

        let padded_size = 1 << self.depth;
        let leaf_start = padded_size - 1;
        let mut node_index = leaf_start + leaf_index;

        let leaf = self.nodes[node_index];
        let mut siblings = Vec::with_capacity(self.depth);
        let mut indices = Vec::with_capacity(self.depth);

        while node_index > 0 {
            let is_right = node_index.is_multiple_of(2);
            let sibling_index = if is_right {
                node_index - 1
            } else {
                node_index + 1
            };

            siblings.push(self.nodes[sibling_index]);
            indices.push(is_right);

            // Move to parent
            node_index = (node_index - 1) / 2;
        }

        Some(MerklePath {
            siblings,
            indices,
            leaf,
        })
    }

    /// Generate a Merkle path for a specific leaf value.
    pub fn get_path_for_leaf(&self, leaf: &Fr) -> Option<MerklePath> {
        let index = self.find_leaf(leaf)?;
        self.get_path(index)
    }

    /// Serialize tree data for storage.
    pub fn to_bytes(&self) -> Vec<u8> {
        let data = MerkleTreeData {
            nodes: self
                .nodes
                .iter()
                .map(|f| {
                    let mut bytes = [0u8; 32];
                    f.serialize_compressed(&mut bytes[..]).unwrap();
                    bytes
                })
                .collect(),
            depth: self.depth,
            num_leaves: self.num_leaves,
        };
        bincode::serialize(&data).unwrap()
    }

    /// Deserialize tree from bytes.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, bincode::Error> {
        let data: MerkleTreeData = bincode::deserialize(bytes)?;
        let hasher = PoseidonHasher::new();

        let nodes: Vec<Fr> = data
            .nodes
            .iter()
            .map(|b| Fr::deserialize_compressed(&b[..]).unwrap())
            .collect();

        // Rebuild leaf index
        let padded_size = 1 << data.depth;
        let leaf_start = padded_size - 1;
        let mut leaf_index = HashMap::new();

        for i in 0..data.num_leaves {
            let mut bytes = [0u8; 32];
            nodes[leaf_start + i]
                .serialize_compressed(&mut bytes[..])
                .ok();
            leaf_index.insert(bytes, i);
        }

        Ok(Self {
            nodes,
            depth: data.depth,
            num_leaves: data.num_leaves,
            hasher,
            leaf_index,
        })
    }

    /// Save tree to a file.
    pub fn save_to_file(&self, path: &std::path::Path) -> std::io::Result<()> {
        let bytes = self.to_bytes();
        std::fs::write(path, bytes)
    }

    /// Load tree from a file.
    pub fn load_from_file(path: &std::path::Path) -> Result<Self, TreeError> {
        let bytes = std::fs::read(path).map_err(TreeError::IoError)?;
        Self::from_bytes(&bytes).map_err(|e| TreeError::DeserializationError(e.to_string()))
    }
}

/// Errors that can occur with Merkle tree operations.
#[derive(Debug, thiserror::Error)]
pub enum TreeError {
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Deserialization error: {0}")]
    DeserializationError(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_tree() {
        let tree = MerkleTree::new(vec![]);
        assert_eq!(tree.num_leaves(), 0);
    }

    #[test]
    fn test_single_leaf() {
        let leaf = Fr::from(42u64);
        let tree = MerkleTree::new(vec![leaf]);

        assert_eq!(tree.num_leaves(), 1);
        assert!(tree.contains(&leaf));

        let path = tree.get_path(0).unwrap();
        assert!(path.verify(&tree.root(), tree.hasher()));
    }

    #[test]
    fn test_multiple_leaves() {
        let leaves: Vec<Fr> = (0..8).map(|i| Fr::from(i as u64)).collect();
        let tree = MerkleTree::new(leaves.clone());

        assert_eq!(tree.num_leaves(), 8);
        assert_eq!(tree.depth(), 3);

        for (i, leaf) in leaves.iter().enumerate() {
            assert!(tree.contains(leaf));
            let path = tree.get_path(i).unwrap();
            assert!(path.verify(&tree.root(), tree.hasher()));
        }
    }

    #[test]
    fn test_non_power_of_two() {
        let leaves: Vec<Fr> = (0..5).map(|i| Fr::from(i as u64)).collect();
        let tree = MerkleTree::new(leaves.clone());

        assert_eq!(tree.num_leaves(), 5);
        assert_eq!(tree.depth(), 3); // Padded to 8

        for i in 0..leaves.len() {
            let path = tree.get_path(i).unwrap();
            assert!(path.verify(&tree.root(), tree.hasher()));
        }
    }

    #[test]
    fn test_serialization() {
        let leaves: Vec<Fr> = (0..4).map(|i| Fr::from(i as u64)).collect();
        let tree = MerkleTree::new(leaves.clone());

        let bytes = tree.to_bytes();
        let restored = MerkleTree::from_bytes(&bytes).unwrap();

        assert_eq!(tree.root(), restored.root());
        assert_eq!(tree.depth(), restored.depth());
        assert_eq!(tree.num_leaves(), restored.num_leaves());

        // Verify paths still work
        for i in 0..leaves.len() {
            let path = restored.get_path(i).unwrap();
            assert!(path.verify(&restored.root(), restored.hasher()));
        }
    }

    #[test]
    fn test_invalid_path_fails() {
        let leaves: Vec<Fr> = (0..4).map(|i| Fr::from(i as u64)).collect();
        let tree = MerkleTree::new(leaves);

        let mut path = tree.get_path(0).unwrap();
        // Corrupt the path
        path.siblings[0] = Fr::from(999u64);

        assert!(!path.verify(&tree.root(), tree.hasher()));
    }

    #[test]
    fn test_find_leaf() {
        let leaves: Vec<Fr> = (0..8).map(|i| Fr::from(i as u64)).collect();
        let tree = MerkleTree::new(leaves);

        assert_eq!(tree.find_leaf(&Fr::from(3u64)), Some(3));
        assert_eq!(tree.find_leaf(&Fr::from(100u64)), None);
    }
}

