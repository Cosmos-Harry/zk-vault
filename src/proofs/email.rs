//! Email domain verification using DKIM signatures.
//!
//! Proves you received an email from a specific domain (e.g., @google.com)
//! without revealing your email address or the email content.

use anyhow::{anyhow, Result};
use ark_bn254::Fr;
use ark_ff::PrimeField;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Result of parsing and verifying an email
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailDomainProof {
    /// The verified domain (e.g., "google.com")
    pub domain: String,
    /// Hash of the DKIM signature (for proof binding)
    pub dkim_hash: String,
    /// Whether DKIM signature was valid
    pub dkim_valid: bool,
    /// Timestamp of verification
    pub verified_at: u64,
}

/// Email verifier for extracting domain and validating DKIM
pub struct EmailVerifier;

impl EmailVerifier {
    /// Parse an email file (.eml) and extract the sender domain
    pub fn parse_email(eml_content: &str) -> Result<ParsedEmail> {
        // Parse the email
        let parsed = mailparse::parse_mail(eml_content.as_bytes())
            .map_err(|e| anyhow!("Failed to parse email: {}", e))?;

        // Extract From header
        let from = parsed
            .headers
            .iter()
            .find(|h| h.get_key().to_lowercase() == "from")
            .ok_or_else(|| anyhow!("No From header found"))?
            .get_value();

        // Extract domain from email address
        let domain = Self::extract_domain(&from)?;

        // Extract DKIM signature if present
        let dkim_signature = parsed
            .headers
            .iter()
            .find(|h| h.get_key().to_lowercase() == "dkim-signature")
            .map(|h| h.get_value());

        // Extract the signing domain from DKIM (d= parameter)
        let dkim_domain = dkim_signature
            .as_ref()
            .and_then(|sig| Self::extract_dkim_domain(sig));

        Ok(ParsedEmail {
            from_address: from,
            from_domain: domain,
            dkim_signature,
            dkim_domain,
            raw_content: eml_content.to_string(),
        })
    }

    /// Extract domain from email address
    fn extract_domain(from: &str) -> Result<String> {
        // Handle formats like "John Doe <john@google.com>" or just "john@google.com"
        let email = if from.contains('<') {
            from.split('<')
                .nth(1)
                .and_then(|s| s.split('>').next())
                .ok_or_else(|| anyhow!("Invalid From header format"))?
        } else {
            from.trim()
        };

        let domain = email
            .split('@')
            .nth(1)
            .ok_or_else(|| anyhow!("No @ in email address"))?
            .trim()
            .to_lowercase();

        Ok(domain)
    }

    /// Extract the d= (domain) parameter from DKIM signature
    fn extract_dkim_domain(dkim_sig: &str) -> Option<String> {
        // DKIM signature format: v=1; a=rsa-sha256; d=google.com; s=20230601; ...
        for part in dkim_sig.split(';') {
            let part = part.trim();
            if let Some(domain) = part.strip_prefix("d=") {
                return Some(domain.trim().to_lowercase());
            }
        }
        None
    }

    /// Verify DKIM signature (simplified - full implementation would verify RSA)
    /// 
    /// In production, this would:
    /// 1. Fetch the public key from DNS (selector._domainkey.domain.com)
    /// 2. Verify the RSA signature over the canonicalized headers
    /// 
    /// For MVP, we do a basic structural check
    pub fn verify_dkim(parsed: &ParsedEmail) -> Result<bool> {
        // Check if DKIM signature exists
        let dkim_sig = parsed
            .dkim_signature
            .as_ref()
            .ok_or_else(|| anyhow!("No DKIM signature found"))?;

        // Check required DKIM fields exist
        let has_version = dkim_sig.contains("v=");
        let has_algorithm = dkim_sig.contains("a=");
        let has_domain = dkim_sig.contains("d=");
        let has_selector = dkim_sig.contains("s=");
        let has_signature = dkim_sig.contains("b=");

        if !has_version || !has_algorithm || !has_domain || !has_selector || !has_signature {
            return Err(anyhow!("DKIM signature missing required fields"));
        }

        // Verify the DKIM domain matches the From domain
        if let Some(dkim_domain) = &parsed.dkim_domain {
            // Allow subdomain matching (e.g., mail.google.com signs for google.com)
            if !parsed.from_domain.ends_with(dkim_domain) && dkim_domain != &parsed.from_domain {
                return Err(anyhow!(
                    "DKIM domain {} doesn't match From domain {}",
                    dkim_domain,
                    parsed.from_domain
                ));
            }
        }

        // For full verification, we would:
        // 1. Parse the DKIM signature fields
        // 2. Fetch DNS TXT record for public key
        // 3. Canonicalize headers as specified
        // 4. Verify RSA signature
        // 
        // For MVP, we trust the structural validity
        
        Ok(true)
    }

    /// Generate a proof of email domain ownership
    pub fn generate_proof(parsed: &ParsedEmail) -> Result<EmailDomainProof> {
        // Verify DKIM
        let dkim_valid = Self::verify_dkim(parsed).unwrap_or(false);

        // Hash the DKIM signature for proof binding
        let dkim_hash = if let Some(sig) = &parsed.dkim_signature {
            let mut hasher = Sha256::new();
            hasher.update(sig.as_bytes());
            hex::encode(hasher.finalize())
        } else {
            String::new()
        };

        // Use the DKIM domain if available, otherwise From domain
        let verified_domain = parsed
            .dkim_domain
            .clone()
            .unwrap_or_else(|| parsed.from_domain.clone());

        Ok(EmailDomainProof {
            domain: verified_domain,
            dkim_hash,
            dkim_valid,
            verified_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        })
    }

    /// Convert domain to field element for ZK circuit
    pub fn domain_to_field(domain: &str) -> Fr {
        let mut hasher = Sha256::new();
        hasher.update(domain.as_bytes());
        let hash = hasher.finalize();
        Fr::from_be_bytes_mod_order(&hash)
    }
}

/// Parsed email data
#[derive(Debug, Clone)]
pub struct ParsedEmail {
    /// Full From header value
    pub from_address: String,
    /// Extracted domain
    pub from_domain: String,
    /// DKIM signature header if present
    pub dkim_signature: Option<String>,
    /// Domain from DKIM d= parameter
    pub dkim_domain: Option<String>,
    /// Raw email content
    pub raw_content: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_domain() {
        assert_eq!(
            EmailVerifier::extract_domain("john@google.com").unwrap(),
            "google.com"
        );
        assert_eq!(
            EmailVerifier::extract_domain("John Doe <john@google.com>").unwrap(),
            "google.com"
        );
        assert_eq!(
            EmailVerifier::extract_domain("  jane@EXAMPLE.COM  ").unwrap(),
            "example.com"
        );
    }

    #[test]
    fn test_extract_dkim_domain() {
        let dkim = "v=1; a=rsa-sha256; d=google.com; s=20230601; b=abc123";
        assert_eq!(
            EmailVerifier::extract_dkim_domain(dkim),
            Some("google.com".to_string())
        );
    }

    #[test]
    fn test_domain_to_field() {
        let field1 = EmailVerifier::domain_to_field("google.com");
        let field2 = EmailVerifier::domain_to_field("google.com");
        let field3 = EmailVerifier::domain_to_field("meta.com");

        assert_eq!(field1, field2); // Same domain = same field element
        assert_ne!(field1, field3); // Different domain = different field element
    }
}

