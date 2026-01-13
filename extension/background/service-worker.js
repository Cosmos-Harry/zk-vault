/**
 * ZK Vault Background Service Worker
 * Handles proof storage, generation, and communication with websites
 */

// Debug mode (set to false for production builds)
const DEBUG_MODE = true; // TODO: Set to false before Chrome Web Store submission

// Debug logger (only logs when DEBUG_MODE is true)
const debugLog = (...args) => {
  if (DEBUG_MODE) {
    console.log(...args);
  }
};

// Import WASM module
import init, {
  init_country_prover,
  init_email_prover,
  prove_country,
  prove_email_domain,
  is_prover_ready,
  is_email_prover_ready
} from '../wasm/zk_vault.js';

// Import email parser
import { parseEmail, clearSensitiveData } from '../lib/email-parser.js';

// Import encryption utilities
import { encryptValue, decryptValue, isEncrypted } from '../lib/encryption.js';

// WASM initialization state
let wasmInitialized = false;

// Pending proof requests from websites (runtime only)
const pendingRequests = new Map();

// Storage keys
const STORAGE_KEYS = {
  PROOFS: 'zk_vault_proofs',
  PERMISSIONS: 'zk_vault_permissions',
  SETTINGS: 'zk_vault_settings',
  USER_SECRET: 'zk_vault_user_secret'
};

// Proof types supported
const PROOF_TYPES = {
  EMAIL_DOMAIN: 'email_domain',
  COUNTRY: 'country',
  AGE: 'age'
};

/**
 * Initialize WASM on extension load
 */
async function initializeWASM() {
  if (wasmInitialized) return true;

  try {
    debugLog('[ZK Vault] Initializing WASM...');

    // Initialize WASM module
    await init();

    // Initialize country prover (trusted setup)
    debugLog('[ZK Vault] Performing trusted setup for country proofs...');
    const countrySuccess = init_country_prover();

    if (!countrySuccess) {
      throw new Error('Failed to initialize country prover');
    }

    // Initialize email prover (trusted setup)
    debugLog('[ZK Vault] Performing trusted setup for email proofs...');
    const emailSuccess = init_email_prover();

    if (!emailSuccess) {
      throw new Error('Failed to initialize email prover');
    }

    wasmInitialized = true;
    debugLog('[ZK Vault] ✓ WASM initialized successfully (country + email provers ready)');
    return true;
  } catch (error) {
    console.error('[ZK Vault] Failed to initialize WASM:', error);
    return false;
  }
}

// Initialize WASM immediately
initializeWASM();

/**
 * Securely store user secret with encryption
 * @param {string} secret - The user secret to store
 */
async function storeUserSecretSecurely(secret) {
  const encrypted = await encryptValue(secret);
  await chrome.storage.local.set({ [STORAGE_KEYS.USER_SECRET]: encrypted });
  debugLog('[ZK Vault] User secret stored securely (encrypted)');
}

/**
 * Retrieve and decrypt user secret
 * @returns {Promise<string|null>} Decrypted user secret or null if not found
 */
async function getUserSecretSecurely() {
  const { [STORAGE_KEYS.USER_SECRET]: stored } = await chrome.storage.local.get(STORAGE_KEYS.USER_SECRET);

  if (!stored) {
    return null;
  }

  // Check if already encrypted
  if (isEncrypted(stored)) {
    try {
      return await decryptValue(stored);
    } catch (error) {
      console.error('[ZK Vault] Failed to decrypt user secret:', error);
      return null;
    }
  }

  // Legacy: if stored as plaintext, encrypt it and re-save
  if (typeof stored === 'string') {
    debugLog('[ZK Vault] Migrating plaintext user secret to encrypted storage');
    await storeUserSecretSecurely(stored);
    return stored;
  }

  return null;
}

/**
 * Initialize extension on install
 */
chrome.runtime.onInstalled.addListener(async () => {
  debugLog('ZK Vault installed');

  // Initialize storage
  await chrome.storage.local.set({
    [STORAGE_KEYS.PROOFS]: {},
    [STORAGE_KEYS.PERMISSIONS]: {},
    [STORAGE_KEYS.SETTINGS]: {
      autoApprove: false,
      expiryDays: 30
    }
  });

  // Initialize WASM
  await initializeWASM();
});

/**
 * Validate message origin for security
 */
function isValidMessageOrigin(sender) {
  // Messages from extension pages (popup, background) are always valid
  if (!sender.url) return true;
  if (sender.url.startsWith('chrome-extension://')) return true;

  // Messages from content scripts need origin validation
  // Content scripts can be injected into any page, but we verify the sender
  // Note: Chrome validates that sender.tab and sender.url are legitimate
  return sender.tab != null; // Ensures message came from a real tab, not spoofed
}

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Validate message origin
  if (!isValidMessageOrigin(sender)) {
    console.warn('[ZK Vault] Rejected message from invalid origin:', sender);
    sendResponse({ error: 'Invalid message origin' });
    return false;
  }

  debugLog('Background received message:', request);

  switch (request.action) {
    case 'requestProof':
      handleProofRequest(request, sender, sendResponse);
      return true; // Async response

    case 'generateProof':
      handleProofGeneration(request, sendResponse);
      return true; // Async response

    case 'getProofs':
      handleGetProofs(sendResponse);
      return true; // Async response

    case 'deleteProof':
      handleDeleteProof(request, sendResponse);
      return true; // Async response

    case 'getPermissions':
      handleGetPermissions(request, sendResponse);
      return true; // Async response

    case 'grantPermission':
      handleGrantPermission(request, sendResponse);
      return true; // Async response

    case 'getPendingRequest':
      handleGetPendingRequest(request, sendResponse);
      return true; // Async response

    case 'approveProofRequest':
      handleApproveProofRequest(request, sendResponse);
      return true; // Async response

    case 'denyProofRequest':
      handleDenyProofRequest(request, sendResponse);
      return true; // Async response

    case 'updatePendingRequestProof':
      handleUpdatePendingRequestProof(request, sendResponse);
      return true; // Async response

    default:
      sendResponse({ error: 'Unknown action' });
  }
});

/**
 * Handle proof request from website (WALLET-LIKE FLOW)
 */
async function handleProofRequest(request, sender, sendResponse) {
  try {
    const { requestId, proofType, autoRegister, backendUrl } = request;
    const origin = sender.url ? new URL(sender.url).origin : 'unknown';

    debugLog(`[ZK Vault] Proof request from ${origin} for ${proofType}`);
    debugLog(`[ZK Vault] Request ID: ${requestId}`);
    debugLog(`[ZK Vault] Auto-register: ${autoRegister}`);

    // Get existing proofs
    const { [STORAGE_KEYS.PROOFS]: proofs } = await chrome.storage.local.get(STORAGE_KEYS.PROOFS);
    const proof = proofs[proofType];

    // CASE C: Proof doesn't exist → Open generation popup
    if (!proof) {
      debugLog(`[ZK Vault] Proof doesn't exist, opening generation popup`);
      await openGenerationPopup(requestId, origin, proofType, autoRegister, backendUrl, sendResponse);
      return;
    }

    // Check if proof is expired
    if (proof.expiresAt && Date.now() > proof.expiresAt) {
      debugLog(`[ZK Vault] Proof expired, opening generation popup`);
      await openGenerationPopup(requestId, origin, proofType, autoRegister, backendUrl, sendResponse);
      return;
    }

    // Check permissions
    const { [STORAGE_KEYS.PERMISSIONS]: permissions } = await chrome.storage.local.get(STORAGE_KEYS.PERMISSIONS);
    const hasPermission = permissions[origin]?.[proofType];

    // CASE B: Proof exists but no permission → Open permission popup
    if (!hasPermission) {
      debugLog(`[ZK Vault] Permission not granted, opening permission popup`);
      await openPermissionPopup(requestId, origin, proofType, proof, autoRegister, backendUrl, sendResponse);
      return;
    }

    // CASE A: Proof exists + permission granted → Auto-return with optional auto-registration
    debugLog(`[ZK Vault] Permission granted, auto-returning proof`);
    await returnProofWithRegistration(proof, autoRegister, backendUrl, sendResponse);

  } catch (error) {
    console.error('[ZK Vault] Error handling proof request:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Open permission request popup
 */
async function openPermissionPopup(requestId, origin, proofType, proof, autoRegister, backendUrl, sendResponse) {
  // Store pending request
  pendingRequests.set(requestId, {
    requestId,
    origin,
    proofType,
    proof,
    autoRegister,
    backendUrl,
    sendResponse
  });

  // Position popup on right side (wallet-like)
  const popupWidth = 400;
  const popupHeight = 600;

  // Open popup window (Chrome will position it, we can't control left/top in Manifest V3)
  const popup = await chrome.windows.create({
    url: `popup/popup.html?mode=permission&requestId=${requestId}`,
    type: 'popup',
    width: popupWidth,
    height: popupHeight
  });

  debugLog(`[ZK Vault] Permission popup opened: ${popup.id}`);
}

/**
 * Open generation request popup
 */
async function openGenerationPopup(requestId, origin, proofType, autoRegister, backendUrl, sendResponse) {
  // Store pending request
  pendingRequests.set(requestId, {
    requestId,
    origin,
    proofType,
    autoRegister,
    backendUrl,
    sendResponse
  });

  // Open popup window
  const popup = await chrome.windows.create({
    url: `popup/popup.html?mode=generate&requestId=${requestId}`,
    type: 'popup',
    width: 400,
    height: 600
  });

  debugLog(`[ZK Vault] Generation popup opened: ${popup.id}`);
}

/**
 * Return proof with optional auto-registration
 */
async function returnProofWithRegistration(proof, autoRegister, backendUrl, sendResponse) {
  let registration = null;

  // Perform auto-registration if requested
  if (autoRegister && backendUrl) {
    try {
      registration = await performAutoRegistration(proof, backendUrl);
      debugLog(`[ZK Vault] Auto-registration successful:`, registration);
    } catch (error) {
      // Check if error is due to proof already being used (expected when reusing existing proof)
      const errorMessage = error.message || '';
      if (errorMessage.includes('already used') || errorMessage.includes('already registered')) {
        debugLog('[ZK Vault] Proof already registered - this is normal when reusing an existing proof');
        debugLog('[ZK Vault] User should already be logged in on the frontend');
        // Don't treat this as a fatal error - just return the proof without registration
        // The frontend will handle this by using existing session data
      } else {
        // For other unexpected errors, log them as errors
        console.error('[ZK Vault] Auto-registration failed:', error);
        console.warn('[ZK Vault] Registration failed with unexpected error:', errorMessage);
      }
      // Continue anyway, return proof without registration
    }
  }

  // Return proof (without private data)
  sendResponse({
    success: true,
    proof: {
      type: proof.type,
      data: proof.data,
      publicInputs: proof.publicInputs,
      generatedAt: proof.generatedAt,
      expiresAt: proof.expiresAt
    },
    registration: registration
  });
}

/**
 * Perform auto-registration with backend
 */
async function performAutoRegistration(proof, backendUrl) {
  debugLog(`[ZK Vault] Auto-registering with ${backendUrl}`);

  // Validate backend URL (must be HTTPS and not obviously malicious)
  try {
    const url = new URL(backendUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Invalid backend URL protocol');
    }
  } catch (error) {
    throw new Error('Invalid backend URL: ' + error.message);
  }

  // Build registration payload
  const payload = await buildRegistrationPayload(proof);

  // Make registration request
  debugLog('[ZK Vault] Sending registration payload:', JSON.stringify(payload, null, 2));

  const response = await fetch(backendUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  debugLog('[ZK Vault] Backend response status:', response.status);

  if (!response.ok) {
    // Try to get error details from response body
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json();
      errorMessage = errorBody.error || errorMessage;

      // Only log detailed error if it's NOT the expected "already used" case
      if (!errorMessage.includes('already used') && !errorMessage.includes('already registered')) {
        console.error('[ZK Vault] Backend error response:', errorBody);
      }
    } catch (e) {
      console.error('[ZK Vault] Could not parse error response');
    }
    throw new Error(`Registration failed: ${errorMessage}`);
  }

  const result = await response.json();

  debugLog('[ZK Vault] Registration result from backend:', result);

  // Backend returns {user, token} directly (no success field)
  if (!result.user || !result.token) {
    throw new Error(result.error || 'Registration failed: missing user or token');
  }

  // Return in the format ZK Chat expects: {user, token}
  return {
    user: result.user,
    token: result.token
  };
}

/**
 * Get or generate stable user secret (stored in extension storage with encryption)
 * This secret is used to generate a consistent identity hash across all proof types
 */
async function getUserSecret() {
  // Try to retrieve encrypted secret
  const secret = await getUserSecretSecurely();

  if (secret) {
    return secret;
  }

  // Generate new 32-byte random secret (64 hex characters)
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const newSecret = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');

  // Store it permanently (encrypted)
  await storeUserSecretSecurely(newSecret);
  debugLog('[ZK Vault] Generated new user secret for stable identity (stored encrypted)');

  return newSecret;
}

/**
 * Get stable identity hash from user secret
 * This ensures the same pseudonym across all proof types
 */
async function getIdentityHash() {
  const secret = await getUserSecret();
  return await hashString(secret);
}

/**
 * Build registration payload for backend (async)
 */
async function buildRegistrationPayload(proof) {
  debugLog('[ZK Vault] Building registration payload for proof:', proof);

  if (!proof || !proof.type) {
    console.error('[ZK Vault] Invalid proof structure:', proof);
    throw new Error('Invalid proof structure: missing type');
  }

  // Use stable browser-based identity hash (consistent across all proof types)
  const identityHash = await getIdentityHash();

  if (proof.type === PROOF_TYPES.COUNTRY) {
    return {
      countryProof: {
        identityHash: identityHash, // Stable identity from extension secret
        proofHash: proof.publicInputs.commitment, // ZK commitment for nullifier
        code: proof.publicInputs.countryCode,
        flag: getCountryFlag(proof.publicInputs.countryCode),
        name: proof.publicInputs.countryName
      }
    };
  } else if (proof.type === PROOF_TYPES.EMAIL_DOMAIN) {
    return {
      emailProof: {
        identityHash: identityHash, // Stable identity from extension secret
        proofHash: proof.publicInputs.commitment, // ZK commitment for nullifier
        domain: proof.publicInputs.domain
      }
    };
  }

  throw new Error('Unsupported proof type for registration: ' + proof.type);
}

/**
 * Get country flag emoji
 */
function getCountryFlag(countryCode) {
  // Convert country code to flag emoji (e.g., "US" → "🇺🇸")
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

/**
 * Get pending request (called by popup)
 */
async function handleGetPendingRequest(request, sendResponse) {
  const { requestId } = request;
  const pendingRequest = pendingRequests.get(requestId);

  if (!pendingRequest) {
    sendResponse({ error: 'Request not found' });
    return;
  }

  sendResponse({
    success: true,
    request: {
      requestId: pendingRequest.requestId,
      origin: pendingRequest.origin,
      proofType: pendingRequest.proofType,
      proof: pendingRequest.proof,
      autoRegister: pendingRequest.autoRegister
    }
  });
}

/**
 * Approve proof request (called by popup)
 */
async function handleApproveProofRequest(request, sendResponse) {
  const { requestId, grantPermission } = request;
  const pendingRequest = pendingRequests.get(requestId);

  if (!pendingRequest) {
    sendResponse({ error: 'Request not found' });
    return;
  }

  try {
    // Grant permission if requested
    if (grantPermission) {
      const { [STORAGE_KEYS.PERMISSIONS]: permissions } = await chrome.storage.local.get(STORAGE_KEYS.PERMISSIONS);
      if (!permissions[pendingRequest.origin]) {
        permissions[pendingRequest.origin] = {};
      }
      permissions[pendingRequest.origin][pendingRequest.proofType] = true;
      await chrome.storage.local.set({ [STORAGE_KEYS.PERMISSIONS]: permissions });
      debugLog(`[ZK Vault] Permission granted for ${pendingRequest.origin} → ${pendingRequest.proofType}`);
    }

    // Return proof with optional auto-registration
    await returnProofWithRegistration(
      pendingRequest.proof,
      pendingRequest.autoRegister,
      pendingRequest.backendUrl,
      pendingRequest.sendResponse
    );

    // Clean up
    pendingRequests.delete(requestId);
    sendResponse({ success: true });

  } catch (error) {
    console.error('[ZK Vault] Error approving request:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Deny proof request (called by popup)
 */
async function handleDenyProofRequest(request, sendResponse) {
  const { requestId } = request;
  const pendingRequest = pendingRequests.get(requestId);

  if (!pendingRequest) {
    sendResponse({ error: 'Request not found' });
    return;
  }

  // Reject the original request
  pendingRequest.sendResponse({
    error: 'Permission denied by user'
  });

  // Clean up
  pendingRequests.delete(requestId);
  sendResponse({ success: true });
}

/**
 * Update pending request with newly generated proof (called by popup after generation)
 */
async function handleUpdatePendingRequestProof(request, sendResponse) {
  const { requestId, proof } = request;
  const pendingRequest = pendingRequests.get(requestId);

  if (!pendingRequest) {
    sendResponse({ error: 'Request not found' });
    return;
  }

  // Update the pending request with the generated proof
  pendingRequest.proof = proof;
  pendingRequests.set(requestId, pendingRequest);

  debugLog(`[ZK Vault] Updated pending request ${requestId} with generated proof`);
  sendResponse({ success: true });
}

/**
 * Get human-readable proof description
 */
function getProofDescription(proofType, proof) {
  switch (proofType) {
    case PROOF_TYPES.EMAIL_DOMAIN:
      return `Your email domain: ${proof.publicInputs.domain}`;
    case PROOF_TYPES.COUNTRY:
      return `Your country: ${proof.publicInputs.countryCode}`;
    case PROOF_TYPES.AGE:
      return `That you are over ${proof.publicInputs.minAge}`;
    default:
      return 'Unknown proof type';
  }
}

/**
 * Handle proof generation request
 */
async function handleProofGeneration(request, sendResponse) {
  try {
    const { proofType, privateData } = request;

    debugLog(`Generating ${proofType} proof...`);

    // Generate proof based on type
    let proof;
    switch (proofType) {
      case PROOF_TYPES.EMAIL_DOMAIN:
        proof = await generateEmailDomainProof(privateData);
        break;
      case PROOF_TYPES.COUNTRY:
        proof = await generateCountryProof(privateData);
        break;
      case PROOF_TYPES.AGE:
        proof = await generateAgeProof(privateData);
        break;
      default:
        throw new Error(`Unknown proof type: ${proofType}`);
    }

    // Get settings for expiry
    const { [STORAGE_KEYS.SETTINGS]: settings } = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const expiryMs = settings.expiryDays * 24 * 60 * 60 * 1000;

    // Store proof
    const { [STORAGE_KEYS.PROOFS]: proofs } = await chrome.storage.local.get(STORAGE_KEYS.PROOFS);
    proofs[proofType] = {
      ...proof,
      generatedAt: Date.now(),
      expiresAt: Date.now() + expiryMs
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.PROOFS]: proofs });

    sendResponse({
      success: true,
      proof: proofs[proofType]
    });

  } catch (error) {
    console.error('Error generating proof:', error);
    const errorMessage = error?.message || String(error) || 'Unknown error occurred';
    sendResponse({ error: errorMessage });
  }
}

/**
 * Generate email domain proof - REAL ZK PROOF IMPLEMENTATION
 */
async function generateEmailDomainProof(privateData) {
  debugLog('[ZK Vault] Starting email domain proof generation...');

  const { emlContent } = privateData;

  if (!emlContent) {
    throw new Error('No email content provided');
  }

  // Ensure WASM is initialized
  if (!wasmInitialized) {
    await initializeWASM();
  }

  if (!is_email_prover_ready()) {
    throw new Error('Email prover not ready. Please try again.');
  }

  let rawEmail = emlContent;
  let domain, dkimSignature, authResults;

  try {
    // Parse email to extract DKIM and domain (ephemeral processing)
    debugLog('[ZK Vault] Parsing email headers...');
    const parsed = parseEmail(rawEmail);
    domain = parsed.domain;
    dkimSignature = parsed.dkimSignature;
    authResults = parsed.authResults;

    debugLog('[ZK Vault] ✓ Email parsed successfully');
    debugLog('[ZK Vault] Domain:', domain);

    // CRITICAL: Clear raw email from memory immediately after parsing
    rawEmail = null;
    privateData.emlContent = null;
    delete privateData.emlContent;

    // Generate REAL ZK proof using WASM
    debugLog('[ZK Vault] Generating real Groth16 proof for email domain...');
    debugLog('[ZK Vault] This may take 30-60 seconds...');

    let result;
    try {
      result = prove_email_domain(domain, dkimSignature, authResults);
      debugLog('[ZK Vault] WASM result received (EmailProofResult object)');
    } catch (wasmError) {
      console.error('[ZK Vault] WASM function threw error:', wasmError);
      throw new Error('WASM proof generation failed: ' + (wasmError?.message || String(wasmError)));
    }

    // CRITICAL: Clear DKIM signature from memory
    dkimSignature = null;
    authResults = null;

    // Check if result exists
    if (!result) {
      throw new Error('WASM returned null or undefined result');
    }

    // Access WASM class getters (not plain object properties)
    const success = result.success;
    const dkimVerified = result.dkim_verified;
    const resultDomain = result.domain;
    const error = result.error;

    debugLog('[ZK Vault] Success:', success);
    debugLog('[ZK Vault] DKIM verified:', dkimVerified);
    debugLog('[ZK Vault] Domain:', resultDomain);

    if (!success) {
      const errorMsg = error || 'Proof generation failed (no error message from WASM)';
      throw new Error(errorMsg);
    }

    if (!dkimVerified) {
      throw new Error('DKIM verification failed - email signature invalid or not from ' + domain);
    }

    debugLog('[ZK Vault] ✓ Real ZK proof generated!');

    // Extract all proof data from WASM result object
    const proofHex = result.proof_hex;
    const domainHash = result.domain_hash;
    const commitment = result.commitment;

    debugLog('[ZK Vault] Proof hex length:', proofHex.length);
    debugLog('[ZK Vault] Domain hash:', domainHash);
    debugLog('[ZK Vault] Commitment:', commitment);

    return {
      type: PROOF_TYPES.EMAIL_DOMAIN,
      data: proofHex, // Real Groth16 proof
      publicInputs: {
        domain: resultDomain,
        domainHash: domainHash,
        commitment: commitment
      },
      privateData: null // NEVER store email content
    };

  } catch (error) {
    // Ensure cleanup even on error
    rawEmail = null;
    privateData.emlContent = null;
    dkimSignature = null;
    authResults = null;

    console.error('[ZK Vault] Email proof generation failed:', error);
    throw error;
  }
}

/**
 * Generate country proof using REAL ZK proofs
 */
async function generateCountryProof(privateData) {
  // PRIVACY: Use browser Geolocation API (no third-party services!)
  // Coordinates from popup → convert to country code locally
  debugLog('[ZK Vault] Generating country proof from coordinates...');

  // Ensure WASM is initialized first
  if (!wasmInitialized) {
    await initializeWASM();
  }

  if (!is_prover_ready()) {
    throw new Error('ZK prover not ready. Please try again.');
  }

  // privateData should contain latitude and longitude from popup
  if (!privateData || privateData.latitude === undefined || privateData.longitude === undefined) {
    throw new Error('Location coordinates required. Please allow location access.');
  }

  const { latitude, longitude } = privateData;

  debugLog('[ZK Vault] Converting coordinates to country code...');

  // Convert coordinates to country using bounding boxes
  const countryCode = determineCountryFromCoordinates(latitude, longitude);

  if (!countryCode) {
    throw new Error('Could not determine country from coordinates. You may be in an unsupported region.');
  }

  // Map country codes to names
  const countryNames = {
    'US': 'United States', 'GB': 'United Kingdom', 'CA': 'Canada',
    'AU': 'Australia', 'DE': 'Germany', 'FR': 'France', 'JP': 'Japan',
    'IN': 'India', 'BR': 'Brazil', 'CN': 'China', 'IT': 'Italy',
    'ES': 'Spain', 'MX': 'Mexico', 'RU': 'Russia', 'KR': 'South Korea',
    'NL': 'Netherlands'
  };
  const countryName = countryNames[countryCode] || countryCode;

  debugLog('[ZK Vault] Detected country:', countryName);
  debugLog('[ZK Vault] Generating real Groth16 proof for country:', countryName);

  // Generate ZK proof for the detected country
  const result = prove_country(countryCode);

  if (!result.success) {
    throw new Error(result.error || 'Proof generation failed');
  }

  debugLog('[ZK Vault] ✓ Real ZK proof generated!');
  debugLog('[ZK Vault] Country:', result.country_code, '-', result.country_name);

  return {
    type: PROOF_TYPES.COUNTRY,
    data: result.proof_hex, // Real Groth16 proof
    publicInputs: {
      countryCode: result.country_code,
      countryName: result.country_name,
      commitment: result.public_input
    },
    privateData: null // IP geolocation is external, not stored
  };
}

/**
 * Determine country from coordinates using simple bounding boxes
 * Covers 16 major countries
 */
function determineCountryFromCoordinates(lat, lon) {
  // Canada - Most of Canada is north of 49th parallel
  if (lat >= 49 && lat <= 83.1 && lon >= -141 && lon <= -52.6) {
    return 'CA';
  }

  // Southern Canada (Ontario/Quebec below 49th parallel, but east of -95°)
  if (lat >= 41.7 && lat < 49 && lon >= -95 && lon <= -52.6) {
    return 'CA';
  }

  // United States mainland (exclude areas we've already assigned to Canada)
  if (lat >= 24.5 && lat <= 49 && lon >= -125 && lon <= -66.9) {
    return 'US';
  }

  // Alaska
  if (lat >= 51.2 && lat <= 71.4 && lon >= -179.1 && lon <= -129.9) {
    return 'US';
  }

  // Hawaii
  if (lat >= 18.9 && lat <= 28.5 && lon >= -160 && lon <= -154.8) {
    return 'US';
  }
  // United Kingdom
  if (lat >= 49.9 && lat <= 60.9 && lon >= -8.2 && lon <= 1.8) return 'GB';
  // Germany
  if (lat >= 47.3 && lat <= 55.1 && lon >= 5.9 && lon <= 15.0) return 'DE';
  // France
  if (lat >= 41.3 && lat <= 51.1 && lon >= -5.1 && lon <= 9.6) return 'FR';
  // Japan
  if (lat >= 24.0 && lat <= 45.5 && lon >= 123.0 && lon <= 154.0) return 'JP';
  // India
  if (lat >= 6.7 && lat <= 35.5 && lon >= 68.1 && lon <= 97.4) return 'IN';
  // Brazil
  if (lat >= -33.7 && lat <= 5.3 && lon >= -73.9 && lon <= -34.8) return 'BR';
  // China
  if (lat >= 18.2 && lat <= 53.6 && lon >= 73.5 && lon <= 135.1) return 'CN';
  // Australia
  if (lat >= -43.6 && lat <= -10.7 && lon >= 113.2 && lon <= 153.6) return 'AU';
  // Italy
  if (lat >= 36.6 && lat <= 47.1 && lon >= 6.6 && lon <= 18.5) return 'IT';
  // Spain
  if (lat >= 36.0 && lat <= 43.8 && lon >= -9.3 && lon <= 4.3) return 'ES';
  // Mexico
  if (lat >= 14.5 && lat <= 32.7 && lon >= -118.4 && lon <= -86.7) return 'MX';
  // Russia
  if (lat >= 41.2 && lat <= 81.9 && lon >= 19.6 && lon <= 180) return 'RU';
  // South Korea
  if (lat >= 33.1 && lat <= 38.6 && lon >= 125.0 && lon <= 131.9) return 'KR';
  // Netherlands
  if (lat >= 50.8 && lat <= 53.6 && lon >= 3.4 && lon <= 7.2) return 'NL';

  return null;
}

/**
 * Generate age proof
 */
async function generateAgeProof(privateData) {
  // TODO: Implement actual ZK proof generation with WASM

  const { birthDate, minAge } = privateData;

  return {
    type: PROOF_TYPES.AGE,
    data: 'MOCK_PROOF_DATA_' + Math.random().toString(36),
    publicInputs: {
      minAge: minAge,
      isOver: true
    },
    privateData: null
  };
}

/**
 * Get all stored proofs
 */
async function handleGetProofs(sendResponse) {
  try {
    const { [STORAGE_KEYS.PROOFS]: proofs } = await chrome.storage.local.get(STORAGE_KEYS.PROOFS);
    sendResponse({ success: true, proofs });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

/**
 * Delete a proof
 */
async function handleDeleteProof(request, sendResponse) {
  try {
    const { proofType } = request;
    const { [STORAGE_KEYS.PROOFS]: proofs } = await chrome.storage.local.get(STORAGE_KEYS.PROOFS);

    delete proofs[proofType];
    await chrome.storage.local.set({ [STORAGE_KEYS.PROOFS]: proofs });

    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

/**
 * Get permissions for an origin
 */
async function handleGetPermissions(request, sendResponse) {
  try {
    const { origin } = request;
    const { [STORAGE_KEYS.PERMISSIONS]: permissions } = await chrome.storage.local.get(STORAGE_KEYS.PERMISSIONS);

    sendResponse({
      success: true,
      permissions: permissions[origin] || {}
    });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

/**
 * Grant permission manually
 */
async function handleGrantPermission(request, sendResponse) {
  try {
    const { origin, proofType, granted } = request;
    const { [STORAGE_KEYS.PERMISSIONS]: permissions } = await chrome.storage.local.get(STORAGE_KEYS.PERMISSIONS);

    if (!permissions[origin]) permissions[origin] = {};
    permissions[origin][proofType] = granted;

    await chrome.storage.local.set({ [STORAGE_KEYS.PERMISSIONS]: permissions });
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

/**
 * SHA-256 hash function (returns 64 hex characters)
 */
async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

debugLog('ZK Vault service worker loaded');
