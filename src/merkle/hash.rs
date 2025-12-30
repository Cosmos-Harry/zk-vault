//! Poseidon hash implementation for ZK-friendly operations.

use ark_bn254::Fr;
use ark_crypto_primitives::sponge::{
    poseidon::{PoseidonConfig, PoseidonSponge},
    CryptographicSponge,
};
use ark_ff::{Field, PrimeField};
use ark_std::vec::Vec;

/// Poseidon hasher configured for BN254 scalar field.
#[derive(Clone)]
pub struct PoseidonHasher {
    config: PoseidonConfig<Fr>,
}

impl PoseidonHasher {
    /// Create a new Poseidon hasher with default parameters.
    pub fn new() -> Self {
        let config = Self::default_config();
        Self { config }
    }

    /// Generate default Poseidon configuration for BN254.
    fn default_config() -> PoseidonConfig<Fr> {
        let full_rounds = 8;
        let partial_rounds = 57;
        let alpha = 5;
        let rate = 2;
        let capacity = 1;

        let (ark, mds) = Self::generate_parameters(rate + capacity, full_rounds, partial_rounds);

        PoseidonConfig {
            full_rounds: full_rounds as usize,
            partial_rounds: partial_rounds as usize,
            alpha: alpha as u64,
            ark,
            mds,
            rate,
            capacity,
        }
    }

    /// Generate Poseidon round constants and MDS matrix.
    fn generate_parameters(
        width: usize,
        full_rounds: u32,
        partial_rounds: u32,
    ) -> (Vec<Vec<Fr>>, Vec<Vec<Fr>>) {
        let total_rounds = (full_rounds + partial_rounds) as usize;

        let mut ark = Vec::with_capacity(total_rounds);
        for r in 0..total_rounds {
            let mut round_constants = Vec::with_capacity(width);
            for i in 0..width {
                let seed = ((r * width + i) as u64).wrapping_mul(0x9e3779b97f4a7c15);
                round_constants.push(Fr::from(seed));
            }
            ark.push(round_constants);
        }

        let mut mds = Vec::with_capacity(width);
        for i in 0..width {
            let mut row = Vec::with_capacity(width);
            for j in 0..width {
                let x = Fr::from((i + 1) as u64);
                let y = Fr::from((width + j + 1) as u64);
                let entry = (x + y).inverse().unwrap_or(Fr::from(1u64));
                row.push(entry);
            }
            mds.push(row);
        }

        (ark, mds)
    }

    /// Hash two field elements into one.
    pub fn hash_two(&self, left: &Fr, right: &Fr) -> Fr {
        let mut sponge = PoseidonSponge::new(&self.config);
        sponge.absorb(left);
        sponge.absorb(right);
        sponge.squeeze_field_elements(1)[0]
    }

    /// Hash multiple field elements into one.
    pub fn hash_many(&self, elements: &[Fr]) -> Fr {
        let mut sponge = PoseidonSponge::new(&self.config);
        for elem in elements {
            sponge.absorb(elem);
        }
        sponge.squeeze_field_elements(1)[0]
    }

    /// Get the underlying Poseidon configuration.
    pub fn config(&self) -> &PoseidonConfig<Fr> {
        &self.config
    }
}

impl Default for PoseidonHasher {
    fn default() -> Self {
        Self::new()
    }
}

/// Convert bytes to a field element.
pub fn bytes_to_field(bytes: &[u8]) -> Fr {
    Fr::from_be_bytes_mod_order(bytes)
}

/// Convert a hex string to a field element.
pub fn hex_to_field(hex_str: &str) -> Result<Fr, hex::FromHexError> {
    let bytes = hex::decode(hex_str)?;
    Ok(Fr::from_be_bytes_mod_order(&bytes))
}
