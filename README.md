# ZK Vault

**Prove Anything, Reveal Nothing**

Privacy-preserving identity verification using zero-knowledge proofs. A browser extension that lets you prove claims about yourself without revealing personal data.

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-brightgreen)](https://chrome.google.com/webstore) *(Pending publication)*
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.1.6-blue.svg)](https://github.com/Cosmos-Harry/zk-vault/releases)

---

## 🎯 Features

- **Country Proof**: Prove your country location using IP-based geolocation without revealing your exact coordinates
- **Email Domain Proof**: Verify your email domain (e.g., @gmail.com) using DKIM signatures without exposing your full email address
- **Real ZK Proofs**: Powered by Groth16 cryptographic proofs on BN254 elliptic curve
- **100% Private**: All proof generation happens locally in your browser - your data never leaves your device
- **Web Integration**: Websites can request proofs via `window.zkVault` API with user permission
- **Permission System**: You control which websites can access your proofs
- **Auto-Registration**: Seamless integration with web applications

---

## 📥 Installation

### Chrome Web Store (Recommended)
*Coming soon - currently under review*

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

#### Basic Usage

Websites can request proofs from users:

```javascript
// Check if ZK Vault is installed
if (window.zkVault?.isInstalled()) {
  // Request a country proof
  const result = await window.zkVault.requestProof({
    type: 'country'
  });

  if (result.proof) {
    console.log('Country code:', result.proof.publicInputs.countryCode);
    console.log('Proof data:', result.proof.data);
  }
}
```

#### Auto-Registration (Recommended)

Integrate ZK Vault with your backend for seamless user onboarding:

```javascript
// Request proof with auto-registration
const result = await window.zkVault.requestProof({
  type: 'country',
  autoRegister: true,
  backendUrl: 'https://yoursite.com/api/auth/register'
});

// User is now registered and authenticated!
console.log('User token:', result.registration.token);
console.log('Pseudonym:', result.registration.user.pseudonym);
console.log('User ID:', result.registration.user.id);
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

### Country Proof
- ✅ **Reveals**: Country code (e.g., "US")
- ❌ **Hidden**: Exact coordinates, IP address, city, region
- 🔒 **Storage**: Only country code + cryptographic proof stored locally
- 🔐 **Cryptography**: Groth16 ZK-SNARK on BN254 curve

### Email Domain Proof
- ✅ **Reveals**: Email domain (e.g., "gmail.com")
- ❌ **Hidden**: Full email address, email content
- 🔒 **Processing**: Email processed in memory for 30-60s, then immediately deleted
- 🔐 **Verification**: Uses DKIM signatures for cryptographic verification

### Security
- ✅ All proof generation happens locally in your browser
- ✅ No data sent to external servers (except IP to ip-api.com for country detection)
- ✅ Your proofs are stored locally using `chrome.storage.local`
- ✅ Websites must request permission to access your proofs
- ✅ You can revoke permissions at any time
- ✅ Open source - verify our privacy claims by reviewing the code

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
