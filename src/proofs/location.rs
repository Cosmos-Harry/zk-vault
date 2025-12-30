//! Location/country verification using GPS coordinates.
//!
//! Proves you are located within a specific country without revealing
//! your exact coordinates.

use anyhow::{anyhow, Result};
use ark_bn254::Fr;
use ark_ff::PrimeField;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Country bounding boxes (approximate)
/// Format: (min_lat, max_lat, min_lng, max_lng)
pub struct CountryBounds {
    pub code: &'static str,
    pub name: &'static str,
    pub min_lat: f64,
    pub max_lat: f64,
    pub min_lng: f64,
    pub max_lng: f64,
}

/// Common country bounding boxes
pub const COUNTRIES: &[CountryBounds] = &[
    CountryBounds {
        code: "US",
        name: "United States",
        min_lat: 24.396308,
        max_lat: 49.384358,
        min_lng: -125.0,
        max_lng: -66.93457,
    },
    CountryBounds {
        code: "GB",
        name: "United Kingdom",
        min_lat: 49.674,
        max_lat: 61.061,
        min_lng: -14.015517,
        max_lng: 2.0919117,
    },
    CountryBounds {
        code: "CA",
        name: "Canada",
        min_lat: 41.6751050889,
        max_lat: 83.23324,
        min_lng: -141.0,
        max_lng: -52.6480987209,
    },
    CountryBounds {
        code: "AU",
        name: "Australia",
        min_lat: -43.6345972634,
        max_lat: -10.6681857235,
        min_lng: 113.338953078,
        max_lng: 153.569469029,
    },
    CountryBounds {
        code: "DE",
        name: "Germany",
        min_lat: 47.2701114,
        max_lat: 55.0815,
        min_lng: 5.8663425,
        max_lng: 15.0419319,
    },
    CountryBounds {
        code: "FR",
        name: "France",
        min_lat: 41.3658,
        max_lat: 51.124199,
        min_lng: -5.5591,
        max_lng: 9.6625,
    },
    CountryBounds {
        code: "JP",
        name: "Japan",
        min_lat: 24.396308,
        max_lat: 45.551483,
        min_lng: 122.93457,
        max_lng: 153.986672,
    },
    CountryBounds {
        code: "IN",
        name: "India",
        min_lat: 6.5546079,
        max_lat: 35.6745457,
        min_lng: 68.1113787,
        max_lng: 97.395561,
    },
    CountryBounds {
        code: "BR",
        name: "Brazil",
        min_lat: -33.7683777809,
        max_lat: 5.24448639569,
        min_lng: -73.9872354804,
        max_lng: -34.7299934555,
    },
    CountryBounds {
        code: "CN",
        name: "China",
        min_lat: 18.1535,
        max_lat: 53.56086,
        min_lng: 73.4994136,
        max_lng: 134.7754563,
    },
];

/// GPS coordinates
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Coordinates {
    pub latitude: f64,
    pub longitude: f64,
}

/// Result of location verification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationProof {
    /// Country code (e.g., "US")
    pub country_code: String,
    /// Country name (e.g., "United States")
    pub country_name: String,
    /// Proof that coordinates were within bounds
    pub proof_hash: String,
    /// Timestamp of verification
    pub verified_at: u64,
}

/// Location verifier
pub struct LocationVerifier;

impl LocationVerifier {
    /// Check if coordinates are within a country's bounding box
    pub fn is_in_country(coords: &Coordinates, country: &CountryBounds) -> bool {
        coords.latitude >= country.min_lat
            && coords.latitude <= country.max_lat
            && coords.longitude >= country.min_lng
            && coords.longitude <= country.max_lng
    }

    /// Find which country contains the coordinates
    pub fn find_country(coords: &Coordinates) -> Option<&'static CountryBounds> {
        COUNTRIES
            .iter()
            .find(|c| Self::is_in_country(coords, c))
    }

    /// Verify coordinates are in a specific country
    pub fn verify_country(coords: &Coordinates, country_code: &str) -> Result<bool> {
        let country = COUNTRIES
            .iter()
            .find(|c| c.code == country_code)
            .ok_or_else(|| anyhow!("Unknown country code: {}", country_code))?;

        Ok(Self::is_in_country(coords, country))
    }

    /// Generate a proof that coordinates are within a country
    /// 
    /// The proof hides the exact coordinates but proves they fall
    /// within the country's bounding box.
    pub fn generate_proof(coords: &Coordinates) -> Result<LocationProof> {
        let country = Self::find_country(coords)
            .ok_or_else(|| anyhow!("Coordinates not within any known country"))?;

        // Create a proof hash (in production, this would be a ZK proof)
        // For now, we hash the coordinates + country + timestamp
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let mut hasher = Sha256::new();
        hasher.update(coords.latitude.to_be_bytes());
        hasher.update(coords.longitude.to_be_bytes());
        hasher.update(country.code.as_bytes());
        hasher.update(timestamp.to_be_bytes());
        let proof_hash = hex::encode(hasher.finalize());

        Ok(LocationProof {
            country_code: country.code.to_string(),
            country_name: country.name.to_string(),
            proof_hash,
            verified_at: timestamp,
        })
    }

    /// Convert country code to field element for ZK circuit
    pub fn country_to_field(country_code: &str) -> Fr {
        let mut hasher = Sha256::new();
        hasher.update(country_code.as_bytes());
        let hash = hasher.finalize();
        Fr::from_be_bytes_mod_order(&hash)
    }

    /// Get list of supported countries
    pub fn supported_countries() -> Vec<(&'static str, &'static str)> {
        COUNTRIES.iter().map(|c| (c.code, c.name)).collect()
    }
}

/// For the ZK circuit, we encode coordinates as fixed-point integers
/// to avoid floating point in the circuit
pub struct FixedPointCoords {
    /// Latitude * 1_000_000 (6 decimal places)
    pub lat_fixed: i64,
    /// Longitude * 1_000_000 (6 decimal places)
    pub lng_fixed: i64,
}

impl From<&Coordinates> for FixedPointCoords {
    fn from(coords: &Coordinates) -> Self {
        Self {
            lat_fixed: (coords.latitude * 1_000_000.0) as i64,
            lng_fixed: (coords.longitude * 1_000_000.0) as i64,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_san_francisco_in_usa() {
        let sf = Coordinates {
            latitude: 37.7749,
            longitude: -122.4194,
        };
        
        let country = LocationVerifier::find_country(&sf);
        assert!(country.is_some());
        assert_eq!(country.unwrap().code, "US");
    }

    #[test]
    fn test_london_in_uk() {
        let london = Coordinates {
            latitude: 51.5074,
            longitude: -0.1278,
        };
        
        let country = LocationVerifier::find_country(&london);
        assert!(country.is_some());
        assert_eq!(country.unwrap().code, "GB");
    }

    #[test]
    fn test_tokyo_in_japan() {
        let tokyo = Coordinates {
            latitude: 35.6762,
            longitude: 139.6503,
        };
        
        let country = LocationVerifier::find_country(&tokyo);
        assert!(country.is_some());
        assert_eq!(country.unwrap().code, "JP");
    }

    #[test]
    fn test_generate_proof() {
        let sf = Coordinates {
            latitude: 37.7749,
            longitude: -122.4194,
        };
        
        let proof = LocationVerifier::generate_proof(&sf).unwrap();
        assert_eq!(proof.country_code, "US");
        assert_eq!(proof.country_name, "United States");
        assert!(!proof.proof_hash.is_empty());
    }

    #[test]
    fn test_verify_country() {
        let sf = Coordinates {
            latitude: 37.7749,
            longitude: -122.4194,
        };
        
        assert!(LocationVerifier::verify_country(&sf, "US").unwrap());
        assert!(!LocationVerifier::verify_country(&sf, "GB").unwrap());
    }
}

