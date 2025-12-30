# ZK Vault Browser Extension

Zero-knowledge proof-based privacy extension for verifying credentials without revealing sensitive data.

## Development

### Prerequisites

- Node.js (for Tailwind CSS compilation)

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build CSS (run this after making UI changes):
   ```bash
   npm run build:css
   ```

3. For development with auto-rebuild:
   ```bash
   npm run watch:css
   ```

### File Structure

- `popup/` - Extension popup UI
  - `input.css` - Source CSS (Tailwind directives + custom styles)
  - `styles.css` - Built CSS (committed to repo, loaded by extension)
  - `popup.html` - Main popup HTML
  - `popup.js` - Popup logic
- `background/` - Service worker (proof generation, WASM)
- `lib/` - Shared libraries (email parser, etc.)
- `wasm/` - WebAssembly modules for ZK proofs
- `content/` - Content scripts
- `icons/` - Extension icons

### Building

The extension uses Tailwind CSS compiled to a static file for Chrome extension compatibility (CDN scripts are blocked by CSP).

When you modify the UI and add new Tailwind classes:
1. Run `npm run build:css` to rebuild styles.css
2. Reload the extension in Chrome

### Loading Extension in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` folder

## Technologies

- **ZK Proofs**: Groth16 protocol via Rust WASM
- **UI**: Tailwind CSS (pre-compiled)
- **Storage**: Chrome Storage API
- **DKIM Verification**: Email authentication via DKIM signatures
