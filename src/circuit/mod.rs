//! ZK circuit definitions for various proofs.

mod merkle_proof;
mod country_proof;
mod email_proof;

pub use merkle_proof::MerkleProofCircuit;
pub use country_proof::{CountryProofCircuit, ScaledBounds, country_code_to_field, coord_to_scaled, COORD_SCALE};
pub use email_proof::{EmailDomainCircuit, EmailProofInput, string_to_field, extract_domain};
