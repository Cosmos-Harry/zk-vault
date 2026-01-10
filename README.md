# ZK Vault: Prove Anything, Reveal Nothing

**Your Privacy, Cryptographically Guaranteed**

ZK Vault is a privacy-first browser extension that lets you prove claims about yourself without exposing personal information. Using cutting-edge zero-knowledge cryptography, verify your country, email domain, and other attributes while keeping your data completely private.

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-brightgreen)](https://chromewebstore.google.com/detail/ghiclopdpcihbaednbbnldebfbdfdemf)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.1.6-blue.svg)](https://github.com/Cosmos-Harry/zk-vault/releases)

---

## 🔐 How It Works

ZK Vault uses zero-knowledge proofs to verify claims without revealing underlying data:

1. **Generate Proofs**: Create cryptographic proofs of your attributes (country, email domain) locally in your browser
2. **Store Securely**: All proofs are stored in your browser only - nothing is sent to servers
3. **Share Selectively**: Websites can request proofs with your permission - you control what to share and when

## ✨ Key Features

### **Country Verification**
Prove your country without revealing your exact location or IP address
- Uses IP-based geolocation to determine country, then generates a cryptographic proof
- Only country code is revealed - your coordinates and IP stay completely private
- Real zero-knowledge cryptography, not just hidden data

### **Email Domain Verification**
Prove your email domain (e.g., @gmail.com, @university.edu) without exposing your full email address
- Uses DKIM signatures for cryptographic verification
- Your email is never uploaded or stored - processed locally and immediately deleted
- Perfect for student discounts, company verification, or gated communities

### **Real Cryptography**
Built on battle-tested zero-knowledge technology
- Groth16 ZK-SNARKs on BN254 elliptic curve
- Same cryptographic primitives used by major blockchain projects
- Not mock proofs - actual verifiable cryptography that can't be forged

### **100% Private**
Your data never leaves your device. Period.
- All proof generation happens locally in your browser using WebAssembly
- No accounts, no registration, no tracking, no telemetry
- We don't operate servers - there's nothing to collect your data
- Open source - verify our privacy claims yourself

### **Permission System**
You're in complete control
- Websites must request permission before accessing your proofs
- See exactly what data will be shared before approving
- Revoke permissions anytime from extension settings
- Per-website isolation - proofs shared with one site don't leak to others

### **Website Integration**
Built for developers
- Simple JavaScript API for requesting proofs
- Auto-registration flow for seamless user onboarding
- Works with any backend or framework
- Comprehensive documentation and examples

---

## 📥 Installation

### Chrome Web Store (Recommended)

**[📥 Install ZK Vault from Chrome Web Store](https://chromewebstore.google.com/detail/ghiclopdpcihbaednbbnldebfbdfdemf)**

Click the link above and click "Add to Chrome" to install.

### Manual Installation (Development)

1. Clone this repository:
   ```bash
   git clone https://github.com/Cosmos-Harry/zk-vault.git
   cd zk-vault
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top right)

4. Click "Load unpacked"

5. Select the `extension` folder

---

## 🚀 Usage

### For Users

#### Generate a Country Proof
1. Click the ZK Vault extension icon
2. Go to "Proofs" tab
3. Click "Country" to generate a country proof
4. The extension detects your country from IP and generates a cryptographic proof
5. Your proof is stored locally and can be shared with websites

#### Generate an Email Domain Proof
1. Click the ZK Vault extension icon
2. Go to "Proofs" tab
3. Click "Email Domain"
4. Download a `.eml` file from Gmail (Show original → Download original)
5. Upload the `.eml` file to the extension
6. Wait 30-60 seconds for proof generation
7. Your email domain proof is ready (your email address is never stored)

---

### For Developers

Integrate ZK Vault into your website with just a few lines of code:

#### **Quick Start**

```javascript
// 1. Check if user has ZK Vault installed
if (!window.zkVault?.isInstalled()) {
  // Prompt user to install extension
  alert('Please install ZK Vault to continue');
  return;
}

// 2. Request a country proof (user must approve in extension popup)
const result = await window.zkVault.requestProof({
  type: 'country'
});

// 3. Use the proof data
if (result.proof) {
  console.log('Country code:', result.proof.publicInputs.countryCode);
  console.log('Country name:', result.proof.publicInputs.countryName);
  console.log('ZK proof:', result.proof.data);
}
```

#### **Auto-Registration (Recommended)**

Seamless user onboarding with zero personal data collection:

```javascript
// Request proof with automatic backend registration
const result = await window.zkVault.requestProof({
  type: 'country',
  autoRegister: true,
  backendUrl: 'https://yoursite.com/api/auth/register'
});

// Extension automatically:
// 1. Generates ZK proof
// 2. Calls your /register endpoint
// 3. Returns authenticated user session

if (result.registration) {
  // User is now registered and authenticated!
  console.log('Auth token:', result.registration.token);
  console.log('Anonymous ID:', result.registration.user.pseudonym);
  console.log('Country:', result.proof.publicInputs.countryCode);

  // Save token and redirect to app
  localStorage.setItem('authToken', result.registration.token);
  window.location.href = '/dashboard';
}
```

**Your backend receives:**
```json
{
  "proof": {
    "data": "0x...",
    "publicInputs": {
      "countryCode": "US",
      "countryName": "United States",
      "commitment": "0x..."
    }
  }
}
```

**Your backend returns:**
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": "stable_user_id",
    "pseudonym": "Purple Octopus",
    "badges": {
      "country": { "code": "US", "flag": "🇺🇸" }
    }
  }
}
```

#### Email Domain Proof

```javascript
const result = await window.zkVault.requestProof({
  type: 'email_domain',
  autoRegister: true,
  backendUrl: 'https://yoursite.com/api/auth/register'
});

console.log('Email domain:', result.proof.publicInputs.domain); // e.g., "gmail.com"
```

#### API Reference

**`window.zkVault.isInstalled()`**
- Returns: `boolean`
- Check if ZK Vault extension is installed

**`window.zkVault.requestProof(options)`**
- Parameters:
  - `type`: `'country'` or `'email_domain'`
  - `autoRegister` (optional): `boolean` - Auto-register with backend
  - `backendUrl` (optional): `string` - Backend endpoint for registration
- Returns: `Promise<{ proof, registration? }>`

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│          Browser Extension              │
├─────────────────────────────────────────┤
│  Background Service Worker              │
│  - Proof generation (WASM)              │
│  - Permission management                │
│  - Auto-registration                    │
├─────────────────────────────────────────┤
│  Content Script (page-api.js)           │
│  - Injects window.zkVault API           │
│  - Handles website ↔ extension comm     │
├─────────────────────────────────────────┤
│  Popup UI                               │
│  - User interface                       │
│  - Proof management                     │
│  - Settings                             │
├─────────────────────────────────────────┤
│  WASM Modules                           │
│  - Rust-compiled ZK circuits            │
│  - Groth16 proof generation             │
└─────────────────────────────────────────┘
```

**Components:**
- **Background Service Worker**: Handles proof generation using WASM, manages permissions, performs auto-registration
- **Popup UI**: User interface for generating and managing proofs
- **Content Script**: Injects `window.zkVault` API into web pages
- **WASM**: Rust-compiled zero-knowledge proof circuits (arkworks)

---

## 🛡️ Privacy Guarantees

### What ZK Vault DOES:
✅ Generate cryptographic proofs locally in your browser
✅ Store proofs in local browser storage only
✅ Let you share proofs with websites you explicitly trust
✅ Give you full control over your identity data
✅ Use real zero-knowledge cryptography (Groth16 ZK-SNARKs)

### What ZK Vault DOES NOT:
❌ Upload your data to any servers
❌ Track your browsing history or behavior
❌ Share data with third parties
❌ Require accounts, registration, or login
❌ Collect analytics, telemetry, or usage data

### What Each Proof Reveals:

**Country Proof**
- ✅ **Reveals**: Country code only (e.g., "US")
- ❌ **Hidden**: Exact coordinates, IP address, city, state, region
- 🔐 **How**: IP geolocation determines country, then ZK proof is generated locally

**Email Domain Proof**
- ✅ **Reveals**: Email domain only (e.g., "gmail.com")
- ❌ **Hidden**: Full email address, inbox content, email metadata
- 🔐 **How**: DKIM signature verification + ZK proof generation (email processed in memory for 30-60s, then immediately deleted)

### Security Architecture:
- 🔒 All cryptographic operations run in your browser (WebAssembly)
- 🔒 Proofs stored in `chrome.storage.local` (never leaves your device)
- 🔒 Websites require explicit permission to request proofs
- 🔒 Per-website permission isolation
- 🔒 Open source - audit the code yourself on [GitHub](https://github.com/Cosmos-Harry/zk-vault)

---

## 🎯 Use Cases

### **Anonymous Forums & Communities**
Build trust without sacrificing anonymity
- Verify users are from allowed countries without collecting personal information
- Require proof of email domain (e.g., only @company.com) without storing emails
- Create verified-anonymous spaces for whistleblowers, activists, or sensitive discussions

### **Gated Access & Verification**
Control access without invasive data collection
- Restrict content based on location without IP blocking or VPNs breaking your site
- Verify educational email domains (@.edu) for student discounts
- Age-restricted content without government IDs or facial recognition

### **Privacy-First Applications**
Build apps that respect user privacy from the ground up
- Comply with GDPR/CCPA by not collecting unnecessary personal data
- Give users cryptographic control over their identity
- Reduce data breach risk - you can't leak data you never collected

### **Decentralized Identity**
Move beyond the username/password paradigm
- Cryptographically provable claims without centralized identity providers
- Compatible with Web3 and decentralized applications
- Users own their identity data, not platforms

### **Corporate & Enterprise**
Verify employees or partners without exposing PII
- Confirm employee email domains without collecting full email addresses
- Location verification for distributed teams
- Privacy-preserving access control for internal tools

---

## 🔧 Tech Stack

- **Zero-Knowledge Proofs**: [arkworks](https://github.com/arkworks-rs) (Groth16, BN254)
- **WASM**: [wasm-bindgen](https://github.com/rustwasm/wasm-bindgen)
- **Geolocation**: [ip-api.com](https://ip-api.com)
- **Email Verification**: DKIM signature parsing
- **Frontend**: Vanilla JavaScript, Tailwind CSS
- **Extension**: Chrome Extension Manifest V3

---

## 📚 Documentation

- **[Privacy Policy](docs/PRIVACY_POLICY.md)**: Detailed privacy policy and data practices
- **[Security Audit](docs/SECURITY_AUDIT.md)**: Security review and audit findings

---

## 🌐 Related Projects

- **[ZK Chat](https://github.com/Cosmos-Harry/zk-chat)**: Anonymous chat backend using ZK proofs
- **[ZK Chat Frontend](https://github.com/Cosmos-Harry/zk-chat-frontend)**: Web interface for ZK Chat
- **Demo**: Try ZK Vault with ZK Chat at [zkchat.example.com] *(coming soon)*

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🛠️ Development

### Build WASM

```bash
cd extension/wasm
wasm-pack build --target web
```

### Test Extension

1. Load unpacked extension (see Installation)
2. Open popup and generate proofs
3. Test with ZK Chat or build your own integration

---

## 📊 Roadmap

### Completed ✅
- Country proof generation
- Email domain proof generation
- Website integration API
- Permission system
- Auto-registration flow
- Chrome Web Store preparation

### In Progress 🚧
- Chrome Web Store publication
- Documentation improvements

### Planned 📋
- Self-hosted IP geolocation database (privacy improvement)
- Age verification proof
- Additional proof types
- Firefox extension support
- Enhanced permission management UI

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/Cosmos-Harry/zk-vault/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Cosmos-Harry/zk-vault/discussions)
- **Email**: *(Add your support email here)*

---

## ⭐ Show Your Support

If you find ZK Vault useful, please consider:
- ⭐ Starring the repository
- 🐛 Reporting bugs
- 💡 Suggesting new features
- 📝 Contributing code or documentation

---

**Built with privacy in mind. Your data belongs to you, always.**
