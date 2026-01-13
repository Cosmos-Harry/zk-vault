# Security Policy

## Reporting a Vulnerability

We take the security of ZK Vault seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please email security concerns to: harry.cosmonaut@gmail.com

Include in your report:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Critical issues within 30 days

### Scope

Security issues we're interested in:
- Zero-knowledge proof vulnerabilities
- Privacy leaks (IP address, user data)
- Authentication/authorization bypasses
- Code injection (XSS, etc.)
- Cryptographic weaknesses
- Extension permission abuse

Out of scope:
- Issues requiring physical access to user's device
- Social engineering attacks
- Denial of service attacks

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.8   | :white_check_mark: |
| < 0.1.8 | :x:                |

## Security Features

### Current Protections

✅ **Cryptographically Secure Randomness**
- All proof generation uses `getrandom` (Web Crypto API)
- No predictable seeds or timestamps

✅ **Privacy-First Design**
- No third-party API calls
- All proof generation happens locally
- Browser geolocation API with user permission
- No tracking or analytics

✅ **Input Validation**
- File upload size limits (10MB max)
- File type validation (.eml only)
- Message origin validation

✅ **Zero-Knowledge Proofs**
- Groth16 SNARKs on BN254 curve
- Proves claims without revealing data
- Email domain proofs use DKIM verification

✅ **Encrypted Storage**
- User secrets encrypted at rest using AES-GCM 256-bit
- Device-specific encryption keys via PBKDF2
- Web Crypto API for secure key derivation
- Automatic migration from plaintext to encrypted storage

### Known Limitations

⚠️ **Trusted Setup**
- Currently using deterministic setup (not production-grade)
- Future: Multi-party computation (MPC) ceremony

⚠️ **No Request Signing**
- Proof replay possible (mitigated by backend)
- Future: Add HMAC/signature to requests

✅ **Account Recovery**
- 12/24-word recovery phrase (BIP39-compatible)
- Deterministic conversion from user secret
- Secure backup and restore functionality

## Best Practices for Users

1. **Backup Your Data**: Export proofs regularly
2. **Use HTTPS**: Only use ZK Vault on HTTPS websites
3. **Review Permissions**: Check which sites have access
4. **Keep Updated**: Install updates promptly
5. **Report Issues**: See contact info above

## Disclosure Policy

### Our Commitment

- We will acknowledge your report within 48 hours
- We will keep you informed of our progress
- We will credit you (if desired) when we publish the fix
- We will not pursue legal action against good-faith researchers

### Coordinated Disclosure

- Please give us reasonable time to fix the issue
- We aim to fix critical issues within 30 days
- We'll coordinate with you on disclosure timing
- We'll credit you in release notes (unless you prefer anonymity)

## Security Updates

Security updates are distributed via:
- Chrome Web Store (automatic updates)
- GitHub releases
- [Your Website/Blog] for advisories

## Hall of Fame

We thank the following researchers for responsibly disclosing vulnerabilities:

<!-- Future: List contributors here -->

---

**Last Updated**: January 13, 2026
**Contact**: harry.cosmonaut@gmail.com
