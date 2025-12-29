# ZK Vault

Privacy-preserving identity verification using zero-knowledge proofs. A browser extension that lets you prove claims about yourself without revealing personal data.

## Features

- **Country Proof**: Prove your country location using IP-based geolocation
- **Real ZK Proofs**: Powered by Groth16 cryptographic proofs on BN254 curve
- **100% Private**: Proofs are stored locally, coordinates never leave your device
- **Web Integration**: Websites can request proofs via `window.zkVault` API

## Installation

### Load Unpacked Extension (Development)

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `extension` folder

## Usage

### For Users

1. Click the ZK Vault extension icon
2. Go to "Proofs" tab
3. Click "Country" to generate a country proof
4. The extension detects your country from IP and generates a cryptographic proof
5. Your proof is stored locally and can be shared with websites

### For Developers

Websites can request proofs from users:

```javascript
// Check if ZK Vault is installed
if (window.zkVault && window.zkVault.isInstalled()) {
  // Request a country proof
  const proof = await window.zkVault.requestProof('country');

  if (proof) {
    console.log('Country code:', proof.publicInputs.countryCode);
    console.log('Proof data:', proof.data);
  }
}
```

## Architecture

- **Background Service Worker**: Handles proof generation using WASM
- **Popup UI**: User interface for generating and managing proofs
- **Content Script**: Injects `window.zkVault` API into web pages
- **WASM**: Rust-compiled zero-knowledge proof circuits

## Privacy Guarantees

- ✅ Reveals: Country code only
- ❌ Hidden: Exact coordinates, IP address, city
- 🔒 Storage: All data stored locally in browser
- 🔐 Cryptography: Real Groth16 ZK proofs, not mock data

## Tech Stack

- Zero-Knowledge Proofs: [arkworks](https://github.com/arkworks-rs) (Groth16, BN254)
- WASM: [wasm-bindgen](https://github.com/rustwasm/wasm-bindgen)
- Geolocation: [ip-api.com](https://ip-api.com)
- Frontend: Vanilla JavaScript, Chrome Extension Manifest V3

## Related Projects

- [ZK Chat](https://github.com/Cosmos-Harry/zk-chat) - Anonymous chat using ZK proofs
- [ZK Chat Frontend](https://github.com/Cosmos-Harry/zk-chat-frontend) - Web interface for ZK Chat

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

## Future Features

- ✅ Country proof (completed)
- 🚧 Email domain proof (coming soon)
- 🚧 Age verification proof (coming soon)
- 🚧 Chrome Web Store publishing (coming soon)
