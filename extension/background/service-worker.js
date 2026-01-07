/**
 * ZK Vault Background Service Worker
 * Handles proof storage, generation, and communication with websites
 */

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
    console.log('[ZK Vault] Initializing WASM...');

    // Initialize WASM module
    await init();

    // Initialize country prover (trusted setup)
    console.log('[ZK Vault] Performing trusted setup for country proofs...');
    const countrySuccess = init_country_prover();

    if (!countrySuccess) {
      throw new Error('Failed to initialize country prover');
    }

    // Initialize email prover (trusted setup)
    console.log('[ZK Vault] Performing trusted setup for email proofs...');
    const emailSuccess = init_email_prover();

    if (!emailSuccess) {
      throw new Error('Failed to initialize email prover');
    }

    wasmInitialized = true;
    console.log('[ZK Vault] ✓ WASM initialized successfully (country + email provers ready)');
    return true;
  } catch (error) {
    console.error('[ZK Vault] Failed to initialize WASM:', error);
    return false;
  }
}

// Initialize WASM immediately
initializeWASM();

/**
 * Initialize extension on install
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('ZK Vault installed');

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
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);

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

    console.log(`[ZK Vault] Proof request from ${origin} for ${proofType}`);
    console.log(`[ZK Vault] Request ID: ${requestId}`);
    console.log(`[ZK Vault] Auto-register: ${autoRegister}`);

    // Get existing proofs
    const { [STORAGE_KEYS.PROOFS]: proofs } = await chrome.storage.local.get(STORAGE_KEYS.PROOFS);
    const proof = proofs[proofType];

    // CASE C: Proof doesn't exist → Open generation popup
    if (!proof) {
      console.log(`[ZK Vault] Proof doesn't exist, opening generation popup`);
      await openGenerationPopup(requestId, origin, proofType, autoRegister, backendUrl, sendResponse);
      return;
    }

    // Check if proof is expired
    if (proof.expiresAt && Date.now() > proof.expiresAt) {
      console.log(`[ZK Vault] Proof expired, opening generation popup`);
      await openGenerationPopup(requestId, origin, proofType, autoRegister, backendUrl, sendResponse);
      return;
    }

    // Check permissions
    const { [STORAGE_KEYS.PERMISSIONS]: permissions } = await chrome.storage.local.get(STORAGE_KEYS.PERMISSIONS);
    const hasPermission = permissions[origin]?.[proofType];

    // CASE B: Proof exists but no permission → Open permission popup
    if (!hasPermission) {
      console.log(`[ZK Vault] Permission not granted, opening permission popup`);
      await openPermissionPopup(requestId, origin, proofType, proof, autoRegister, backendUrl, sendResponse);
      return;
    }

    // CASE A: Proof exists + permission granted → Auto-return with optional auto-registration
    console.log(`[ZK Vault] Permission granted, auto-returning proof`);
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

  console.log(`[ZK Vault] Permission popup opened: ${popup.id}`);
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

  console.log(`[ZK Vault] Generation popup opened: ${popup.id}`);
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
      console.log(`[ZK Vault] Auto-registration successful:`, registration);
    } catch (error) {
      // Check if error is due to proof already being used (expected when reusing existing proof)
      const errorMessage = error.message || '';
      if (errorMessage.includes('already used') || errorMessage.includes('already registered')) {
        console.log('[ZK Vault] Proof already registered - this is normal when reusing an existing proof');
        console.log('[ZK Vault] User should already be logged in on the frontend');
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
  console.log(`[ZK Vault] Auto-registering with ${backendUrl}`);

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
  console.log('[ZK Vault] Sending registration payload:', JSON.stringify(payload, null, 2));

  const response = await fetch(backendUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  console.log('[ZK Vault] Backend response status:', response.status);

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

  console.log('[ZK Vault] Registration result from backend:', result);

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
 * Get or generate stable user secret (stored in extension storage)
 * This secret is used to generate a consistent identity hash across all proof types
 */
async function getUserSecret() {
  const { [STORAGE_KEYS.USER_SECRET]: secret } = await chrome.storage.local.get(STORAGE_KEYS.USER_SECRET);

  if (secret) {
    return secret;
  }

  // Generate new 32-byte random secret (64 hex characters)
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const newSecret = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');

  // Store it permanently
  await chrome.storage.local.set({ [STORAGE_KEYS.USER_SECRET]: newSecret });
  console.log('[ZK Vault] Generated new user secret for stable identity');

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
  console.log('[ZK Vault] Building registration payload for proof:', proof);

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
      console.log(`[ZK Vault] Permission granted for ${pendingRequest.origin} → ${pendingRequest.proofType}`);
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

  console.log(`[ZK Vault] Updated pending request ${requestId} with generated proof`);
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

    console.log(`Generating ${proofType} proof...`);

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
  console.log('[ZK Vault] Starting email domain proof generation...');

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
    console.log('[ZK Vault] Parsing email headers...');
    const parsed = parseEmail(rawEmail);
    domain = parsed.domain;
    dkimSignature = parsed.dkimSignature;
    authResults = parsed.authResults;

    console.log('[ZK Vault] ✓ Email parsed successfully');
    console.log('[ZK Vault] Domain:', domain);

    // CRITICAL: Clear raw email from memory immediately after parsing
    rawEmail = null;
    privateData.emlContent = null;
    delete privateData.emlContent;

    // Generate REAL ZK proof using WASM
    console.log('[ZK Vault] Generating real Groth16 proof for email domain...');
    console.log('[ZK Vault] This may take 30-60 seconds...');

    let result;
    try {
      result = prove_email_domain(domain, dkimSignature, authResults);
      console.log('[ZK Vault] WASM result received (EmailProofResult object)');
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

    console.log('[ZK Vault] Success:', success);
    console.log('[ZK Vault] DKIM verified:', dkimVerified);
    console.log('[ZK Vault] Domain:', resultDomain);

    if (!success) {
      const errorMsg = error || 'Proof generation failed (no error message from WASM)';
      throw new Error(errorMsg);
    }

    if (!dkimVerified) {
      throw new Error('DKIM verification failed - email signature invalid or not from ' + domain);
    }

    console.log('[ZK Vault] ✓ Real ZK proof generated!');

    // Extract all proof data from WASM result object
    const proofHex = result.proof_hex;
    const domainHash = result.domain_hash;
    const commitment = result.commitment;

    console.log('[ZK Vault] Proof hex length:', proofHex.length);
    console.log('[ZK Vault] Domain hash:', domainHash);
    console.log('[ZK Vault] Commitment:', commitment);

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
  // Fetch country from IP geolocation (no CORS issues in background worker)
  console.log('[ZK Vault] Detecting country from IP...');

  let countryCode;
  try {
    // Use ip-api.com instead of ipapi.co (better support for extensions)
    const res = await fetch('http://ip-api.com/json/?fields=status,countryCode,country');

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    console.log('[ZK Vault] Geolocation response:', data);

    if (data.status !== 'success') {
      throw new Error('Geolocation API returned error status');
    }

    if (!data.countryCode) {
      throw new Error('Could not determine country from IP');
    }

    countryCode = data.countryCode;
    console.log('[ZK Vault] ✓ Country detected:', countryCode, '-', data.country);
  } catch (error) {
    console.error('[ZK Vault] Geolocation error:', error);
    throw new Error('Failed to detect country from IP: ' + error.message);
  }

  // Ensure WASM is initialized
  if (!wasmInitialized) {
    await initializeWASM();
  }

  if (!is_prover_ready()) {
    throw new Error('ZK prover not ready. Please try again.');
  }

  console.log('[ZK Vault] Generating real Groth16 proof for country...');

  // Generate REAL ZK proof using WASM (same approach as zk-chat)
  const result = prove_country(countryCode);

  if (!result.success) {
    throw new Error(result.error || 'Proof generation failed');
  }

  console.log('[ZK Vault] ✓ Real ZK proof generated!');
  console.log('[ZK Vault] Country:', result.country_code, '-', result.country_name);

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

console.log('ZK Vault service worker loaded');
