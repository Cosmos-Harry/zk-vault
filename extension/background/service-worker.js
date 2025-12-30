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
} from '../wasm/zk_chat.js';

// Import email parser
import { parseEmail, clearSensitiveData } from '../lib/email-parser.js';

// WASM initialization state
let wasmInitialized = false;

// Storage keys
const STORAGE_KEYS = {
  PROOFS: 'zk_vault_proofs',
  PERMISSIONS: 'zk_vault_permissions',
  SETTINGS: 'zk_vault_settings'
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

    default:
      sendResponse({ error: 'Unknown action' });
  }
});

/**
 * Handle proof request from website
 */
async function handleProofRequest(request, sender, sendResponse) {
  try {
    const { proofType } = request;
    const origin = sender.url ? new URL(sender.url).origin : 'unknown';

    console.log(`Proof request from ${origin} for ${proofType}`);

    // Get existing proofs
    const { [STORAGE_KEYS.PROOFS]: proofs } = await chrome.storage.local.get(STORAGE_KEYS.PROOFS);

    // Check if proof exists
    if (!proofs[proofType]) {
      sendResponse({
        error: 'Proof not found',
        message: `Please generate a ${proofType} proof first`
      });
      return;
    }

    // Check if proof is expired
    const proof = proofs[proofType];
    if (proof.expiresAt && Date.now() > proof.expiresAt) {
      sendResponse({
        error: 'Proof expired',
        message: 'Please regenerate this proof'
      });
      return;
    }

    // Check permissions
    const { [STORAGE_KEYS.PERMISSIONS]: permissions } = await chrome.storage.local.get(STORAGE_KEYS.PERMISSIONS);
    const hasPermission = permissions[origin]?.[proofType];

    if (!hasPermission) {
      // Request user permission via notification
      const granted = await requestUserPermission(origin, proofType, proof);

      if (!granted) {
        sendResponse({ error: 'Permission denied by user' });
        return;
      }

      // Save permission
      if (!permissions[origin]) permissions[origin] = {};
      permissions[origin][proofType] = true;
      await chrome.storage.local.set({ [STORAGE_KEYS.PERMISSIONS]: permissions });
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
      }
    });

  } catch (error) {
    console.error('Error handling proof request:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Request user permission to share proof
 */
async function requestUserPermission(origin, proofType, proof) {
  return new Promise((resolve) => {
    // Create notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../icons/icon-128.png',
      title: 'ZK Vault Permission Request',
      message: `${origin} wants to verify your ${proofType} proof.\n\nThis will reveal: ${getProofDescription(proofType, proof)}`,
      buttons: [
        { title: 'Allow' },
        { title: 'Deny' }
      ],
      requireInteraction: true
    }, (notificationId) => {
      // Handle button click
      chrome.notifications.onButtonClicked.addListener((clickedId, buttonIndex) => {
        if (clickedId === notificationId) {
          chrome.notifications.clear(notificationId);
          resolve(buttonIndex === 0); // 0 = Allow, 1 = Deny
        }
      });

      // Handle close
      chrome.notifications.onClosed.addListener((closedId) => {
        if (closedId === notificationId) {
          resolve(false); // Treat close as deny
        }
      });
    });
  });
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
    console.log('[ZK Vault] DKIM signature length:', dkimSignature.length, 'chars');

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
 * Simple hash function (replace with proper crypto later)
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

console.log('ZK Vault service worker loaded');
