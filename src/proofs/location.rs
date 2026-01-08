//! Country bounding boxes for location verification.
//!
//! This module provides the country database used by the ZK proof system.
//! The actual proof generation happens in wasm.rs using the circuit.

/// Country bounding box
pub struct CountryBounds {
    pub code: &'static str,
    pub name: &'static str,
    pub min_lat: f64,
    pub max_lat: f64,
    pub min_lng: f64,
    pub max_lng: f64,
}

/// Database of country bounding boxes (approximate)
///
/// Format: (code, name, min_lat, max_lat, min_lng, max_lng)
/// These are used to verify coordinates fall within a country's bounds
/// before generating a ZK proof.
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
