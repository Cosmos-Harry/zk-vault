# Privacy Policy for ZK Vault

**Last Updated**: January 5, 2026

## Introduction

ZK Vault ("we," "our," or "the extension") is a browser extension that enables privacy-preserving identity verification using zero-knowledge cryptographic proofs. This privacy policy explains how we handle your data.

## Our Core Privacy Principle

**Your data never leaves your device.** ZK Vault is built on the principle that your personal information belongs to you and should remain under your control at all times.

## Data Collection and Usage

### 1. What Data We Collect

#### Country Proof Generation
When you generate a country proof:
- **IP Address**: Temporarily sent to ip-api.com to determine your country
- **Country Information**: Country code, name, and coordinates returned from ip-api.com
- **Cryptographic Proof**: Generated locally in your browser

**Storage**: Only the country code and cryptographic proof are stored locally in your browser. Your IP address and exact coordinates are never stored.

#### Email Domain Proof Generation
When you generate an email domain proof:
- **Email File (.eml)**: You manually upload an email file
- **DKIM Signature**: Extracted from the email headers
- **Email Domain**: Parsed from the "From" header

**Processing**: The email file is processed entirely in your browser memory (30-60 seconds), then immediately deleted. Only the domain name and cryptographic proof are stored locally.

**Storage**: Only the email domain (e.g., "gmail.com") and cryptographic proof are stored locally. Your full email address is never stored.

### 2. How We Use Your Data

- **Proof Generation**: Your data is used solely to generate zero-knowledge cryptographic proofs
- **Local Storage**: Proofs are stored in your browser's local storage for future use
- **Sharing**: Proofs are only shared with websites when you explicitly approve a permission request

### 3. What We Do NOT Collect

- ❌ Browsing history
- ❌ Personal identifiable information (PII) beyond what you explicitly provide for proof generation
- ❌ Analytics or telemetry data
- ❌ Usage statistics
- ❌ Your exact location or coordinates
- ❌ Your full email address

## Third-Party Services

### IP Geolocation API
- **Service**: [ip-api.com](https://ip-api.com)
- **Purpose**: Determine your country from your IP address
- **Data Sent**: Your IP address (automatically sent when making API request)
- **Data Received**: Country code, country name, latitude/longitude (country-level only)
- **Privacy Policy**: https://ip-api.com/docs/legal

**Note**: We do not control ip-api.com's data practices. Your IP address is visible to them when you generate a country proof. We recommend reviewing their privacy policy.

## Data Storage

### Local Browser Storage
All ZK Vault data is stored locally in your browser using:
- **Chrome Storage API** (`chrome.storage.local`)

**What's Stored**:
```json
{
  "country": {
    "type": "country",
    "code": "US",
    "name": "United States",
    "flag": "🇺🇸",
    "proofHash": "0x...",
    "identityHash": "0x...",
    "proof": "0x... (cryptographic proof bytes)",
    "timestamp": 1704384000000
  },
  "email": {
    "type": "email_domain",
    "domain": "gmail.com",
    "proofHash": "0x...",
    "identityHash": "0x...",
    "proof": "0x... (cryptographic proof bytes)",
    "timestamp": 1704384000000
  }
}
```

**What's NOT Stored**:
- IP addresses
- Exact coordinates
- Full email addresses
- Email content
- DKIM signatures

### No Server Storage
ZK Vault does not operate any servers. We do not store, transmit, or have access to your data.

## Data Sharing

### With Websites You Visit
When a website requests a proof via `window.zkVault.requestProof()`:

1. **Permission Request**: A popup appears asking for your permission
2. **User Approval**: You must explicitly approve the request
3. **Data Shared**: Only the cryptographic proof and public inputs (country code or email domain)
4. **Persistence**: You can grant persistent permission to trusted websites

**What Websites Receive**:
- Cryptographic proof (hash bytes)
- Public inputs (country code or email domain)
- Proof metadata (type, timestamp)

**What Websites Do NOT Receive**:
- Your IP address (unless they can see it anyway as a website visitor)
- Your exact location
- Your full email address
- Any data you didn't explicitly prove

### Auto-Registration Feature
Some websites may use the "auto-registration" feature:
- The website provides a backend URL
- After you approve the proof, the extension sends the proof to that URL
- The website registers you and returns a session token
- **You control this**: You see which website is requesting, and can deny

**Data Sent to Website Backend** (only if you approve):
```json
{
  "countryProof": {
    "identityHash": "0x...",
    "proofHash": "0x...",
    "code": "US",
    "flag": "🇺🇸",
    "name": "United States"
  }
}
```

## Your Rights

### Access Your Data
All your data is stored locally. You can view it anytime:
1. Open the ZK Vault extension
2. Click on the "Proofs" tab
3. See all your generated proofs

### Delete Your Data
You can delete your data at any time:
- **Individual Proofs**: Click "Delete" button on any proof card
- **All Data**: Uninstall the extension (removes all local storage)
- **Browser Settings**: Clear Chrome extension data for ZK Vault

### Revoke Permissions
Revoke website permissions:
1. Open ZK Vault extension
2. Go to "Settings" tab
3. View and revoke permissions for any website

## Data Security

### Cryptographic Security
- **Zero-Knowledge Proofs**: Groth16 proving system on BN254 elliptic curve
- **No Data Leakage**: Proofs reveal only what you intend (country or domain), nothing more

### Memory Safety
- **Email Processing**: Email files are cleared from memory immediately after proof generation
- **No Persistence**: Sensitive data (IP, coordinates, email content) is never written to storage

### Extension Security
- **Manifest V3**: Uses latest Chrome extension security standards
- **Content Security Policy**: Strict CSP to prevent XSS attacks
- **Minimal Permissions**: Only requests necessary browser permissions

## Children's Privacy

ZK Vault is not directed to children under 13. We do not knowingly collect data from children. If you believe a child has used ZK Vault, please contact us.

## Changes to This Policy

We may update this privacy policy. Changes will be posted at:
- **GitHub**: https://github.com/Cosmos-Harry/zk-vault/blob/main/PRIVACY_POLICY.md
- **Extension Store**: Chrome Web Store listing

Significant changes will be announced via extension update notes.

## Open Source

ZK Vault is open source. You can verify our privacy claims by reviewing the code:
- **GitHub Repository**: https://github.com/Cosmos-Harry/zk-vault
- **License**: MIT

## Contact Us

Questions about this privacy policy or ZK Vault's data practices?

- **Email**: [Your support email - TODO]
- **GitHub Issues**: https://github.com/Cosmos-Harry/zk-vault/issues

## Legal Compliance

### GDPR (European Users)
If you're in the EU:
- **Data Controller**: You control your data locally
- **Right to Access**: View your data anytime in the extension
- **Right to Deletion**: Delete proofs or uninstall extension
- **Right to Portability**: Export proofs as JSON (feature can be added)
- **Data Processing**: All processing is local; no cross-border transfer

### CCPA (California Users)
If you're in California:
- **Personal Information**: We don't collect PI in the traditional sense (no servers)
- **Sale of Data**: We do not sell your data
- **Right to Know**: You can see all data in the extension
- **Right to Delete**: Delete proofs or uninstall extension

## Third-Party Websites

Websites that integrate with ZK Vault have their own privacy policies. We are not responsible for their data practices. Always review a website's privacy policy before sharing proofs.

---

**Summary**: ZK Vault is privacy-first. Your data stays on your device. You control what to prove and when to share. We don't operate servers, don't collect analytics, and don't sell data. Period.
