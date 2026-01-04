/**
 * ZK Vault Popup JavaScript
 * Handles UI interactions and communication with background service worker
 * Version: 0.1.1 - 2026-01-04
 */

console.log('[ZK Vault] Popup loaded - Version 0.1.3 - Back button visible, bigger card, no scrollbar');

// DOM Elements
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const proofsList = document.getElementById('proofs-list');
const permissionsList = document.getElementById('permissions-list');
const noPermissions = document.getElementById('no-permissions');
const generateModal = document.getElementById('generate-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.querySelector('.modal-close');
const proofOptions = document.querySelectorAll('.proof-option:not(.disabled)');
const expiryDaysSelect = document.getElementById('expiry-days');
const autoApproveCheckbox = document.getElementById('auto-approve');
const clearDataButton = document.getElementById('clear-data');

/**
 * Global clipboard copy function (CSP-compliant)
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showNotification('Copied to clipboard!', 'success');
  } catch (error) {
    console.error('Failed to copy:', error);
    showNotification('Failed to copy to clipboard', 'error');
  }
}

/**
 * Initialize popup
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('ZK Vault popup loaded');

  // Setup tab navigation
  setupTabs();

  // Setup proof generation buttons
  setupProofGeneration();

  // Setup settings
  setupSettings();

  // Load and display proofs
  await loadProofs();

  // Load and display permissions
  await loadPermissions();
});

/**
 * Setup tab navigation
 */
function setupTabs() {
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');

      // Update active tab button
      tabs.forEach(t => {
        t.classList.remove('active', 'text-emerald-500');
        t.classList.add('text-zinc-400');
      });
      tab.classList.add('active', 'text-emerald-500');
      tab.classList.remove('text-zinc-400');

      // Update active tab content
      tabContents.forEach(content => {
        if (content.id === `${targetTab}-tab`) {
          content.classList.remove('hidden');
          content.classList.add('block');
        } else {
          content.classList.add('hidden');
          content.classList.remove('block');
        }
      });
    });
  });
}

/**
 * Setup proof generation buttons
 */
function setupProofGeneration() {
  proofOptions.forEach(button => {
    button.addEventListener('click', () => {
      const proofType = button.getAttribute('data-type');
      openGenerateModal(proofType);
    });
  });

  // Close modal
  modalClose.addEventListener('click', closeGenerateModal);
  generateModal.addEventListener('click', (e) => {
    if (e.target === generateModal) {
      closeGenerateModal();
    }
  });
}

/**
 * Open proof generation modal
 */
function openGenerateModal(proofType) {
  modalTitle.textContent = getProofTitle(proofType);
  modalBody.innerHTML = getProofForm(proofType);
  generateModal.classList.remove('hidden');
  generateModal.classList.add('flex');

  // Setup form submission
  const form = modalBody.querySelector('form');
  if (form) {
    form.addEventListener('submit', (e) => handleProofGeneration(e, proofType));
  }

  // Setup email domain specific handlers
  if (proofType === 'email_domain') {
    setupEmailDomainHandlers();
  }
}

/**
 * Setup email domain specific button handlers
 */
function setupEmailDomainHandlers() {
  const openGmailBtn = document.getElementById('open-gmail-btn');
  const uploadBtn = document.getElementById('upload-btn');
  const emlUpload = document.getElementById('eml-upload');
  const fileSelected = document.getElementById('file-selected');

  // Open Gmail button
  if (openGmailBtn) {
    openGmailBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://mail.google.com' });
    });
  }

  // Upload button triggers file input
  if (uploadBtn && emlUpload) {
    uploadBtn.addEventListener('click', () => {
      emlUpload.click();
    });
  }

  // File selection handler
  if (emlUpload) {
    emlUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        fileSelected.textContent = `Selected: ${file.name}`;
        fileSelected.classList.remove('hidden');

        // Auto-submit the form to start proof generation
        handleEmailProofGeneration(file);
      }
    });
  }
}

/**
 * Handle email proof generation with file upload
 */
async function handleEmailProofGeneration(file) {
  // Validate file
  if (!file.name.endsWith('.eml')) {
    showProofError('Please select a .eml file');
    return;
  }

  const container = document.getElementById('progress-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3">
      <div class="flex items-center gap-2 text-sm text-zinc-300">
        <div class="w-4 h-4 border-2 border-vault-500 border-t-transparent rounded-full animate-spin"></div>
        <span id="progress-text">Reading email file...</span>
      </div>
      <div class="w-full bg-zinc-700 rounded-full h-2">
        <div id="progress-bar" class="bg-vault-500 h-2 rounded-full transition-all duration-500" style="width: 10%"></div>
      </div>
      <p class="text-xs text-zinc-400 text-center">
        Generating zero-knowledge proof (30-60 seconds)
      </p>
    </div>
  `;

  // Read file
  const reader = new FileReader();
  reader.onload = async (event) => {
    const emlContent = event.target.result;

    // Update progress
    const progressText = document.getElementById('progress-text');
    const progressBar = document.getElementById('progress-bar');

    if (progressText) progressText.textContent = 'Verifying DKIM signature...';
    if (progressBar) progressBar.style.width = '30%';

    // Animate progress bar during 30-60s proof generation
    let progress = 30;
    const interval = setInterval(() => {
      progress += 1;
      if (progress <= 95 && progressBar) {
        progressBar.style.width = `${progress}%`;
      }
      if (progress === 50 && progressText) {
        progressText.textContent = 'Generating cryptographic proof...';
      }
    }, 600); // ~60 seconds to reach 95%

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'generateProof',
        proofType: 'email_domain',
        privateData: { emlContent }
      });

      clearInterval(interval);

      if (response.error) {
        showProofError(response.error);
      } else {
        // Complete progress
        if (progressBar) progressBar.style.width = '100%';
        if (progressText) progressText.textContent = '✓ Proof generated!';

        setTimeout(() => {
          closeGenerateModal();
          loadProofs();
          showNotification('Email domain proof generated!', 'success');
        }, 1000);
      }
    } catch (error) {
      clearInterval(interval);
      showProofError(error.message);
    }
  };

  reader.onerror = () => {
    showProofError('Failed to read file');
  };

  reader.readAsText(file);
}

/**
 * Show error in progress container
 */
function showProofError(message) {
  const container = document.getElementById('progress-container');
  if (!container) return;

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
      <p class="text-sm text-red-300 font-medium">❌ Error</p>
      <p class="text-xs text-red-400 mt-1">${getProofErrorMessage(message)}</p>
      <button id="error-reload-btn" class="mt-3 text-xs text-red-400 hover:text-red-300 underline">
        Try Again
      </button>
    </div>
  `;

  // Add event listener for reload button
  const reloadBtn = container.querySelector('#error-reload-btn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => location.reload());
  }
}

/**
 * Get user-friendly error message
 */
function getProofErrorMessage(error) {
  if (error.includes('DKIM')) {
    return "This email doesn't have a valid DKIM signature. Please try a different email from Gmail.";
  } else if (error.includes('format')) {
    return 'Invalid email file format. Make sure you downloaded the .eml file correctly.';
  } else if (error.includes('From header')) {
    return 'Could not extract email domain. Make sure the .eml file is valid.';
  }
  return error;
}

/**
 * Close proof generation modal
 */
function closeGenerateModal() {
  generateModal.classList.add('hidden');
  generateModal.classList.remove('flex');
  modalBody.innerHTML = '';
}

/**
 * Get proof title
 */
function getProofTitle(proofType) {
  const titles = {
    email_domain: 'Generate Email Domain Proof',
    country: 'Generate Country Proof',
    age: 'Generate Age Proof'
  };
  return titles[proofType] || 'Generate Proof';
}

/**
 * Get proof generation form HTML
 */
function getProofForm(proofType) {
  switch (proofType) {
    case 'email_domain':
      return `
        <form id="proof-form" class="space-y-4">
          <div class="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <div class="flex items-start gap-2">
              <svg class="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
              <div>
                <p class="text-xs text-emerald-300 leading-relaxed">
                  <strong>100% Private:</strong> We never access your Gmail account. You download one email file (.eml), we process it locally and immediately delete it from memory after generating your proof.
                </p>
              </div>
            </div>
          </div>

          <div class="bg-zinc-900/50 border border-zinc-700 rounded-xl p-4">
            <div class="flex items-center gap-2.5 mb-3">
              <div class="bg-emerald-500/15 w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0">
                <span class="text-sm text-emerald-400 font-semibold">1</span>
              </div>
              <p class="text-sm font-medium text-zinc-200">Download Email from Gmail</p>
            </div>
            <ol class="text-xs text-zinc-400 leading-relaxed pl-9 mb-3 space-y-1">
              <li>• Open any email in Gmail</li>
              <li>• Click <strong class="text-zinc-300">⋮</strong> (three dots menu)</li>
              <li>• Select <strong class="text-zinc-300">"Show original"</strong></li>
              <li>• Click <strong class="text-zinc-300">"Download original"</strong> button</li>
            </ol>
            <button type="button" id="open-gmail-btn"
              class="w-full py-2 px-4 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-[13px] transition-all flex items-center justify-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              Open Gmail in New Tab
            </button>
          </div>

          <div class="bg-zinc-900/50 border border-zinc-700 rounded-xl p-4">
            <div class="flex items-center gap-2.5 mb-3">
              <div class="bg-emerald-500/15 w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0">
                <span class="text-sm text-emerald-400 font-semibold">2</span>
              </div>
              <p class="text-sm font-medium text-zinc-200">Upload .eml File</p>
            </div>
            <input type="file" id="eml-upload" accept=".eml" class="hidden" required>
            <button type="button" id="upload-btn"
              class="w-full py-3 px-4 bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-lg text-sm font-semibold transition-all hover:shadow-lg hover:shadow-emerald-500/20 hover:-translate-y-0.5 flex items-center justify-center gap-2">
              <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
              </svg>
              Choose .eml File
            </button>
            <p id="file-selected" class="text-xs text-zinc-400 hidden mt-2"></p>
          </div>

          <div id="progress-container" class="hidden"></div>

          <button type="submit" class="hidden" id="submit-btn"></button>
        </form>
      `;

    case 'country':
      return `
        <form id="proof-form" class="space-y-4">
          <div class="p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
            <p class="text-xs font-semibold text-zinc-300 mb-2">How it works:</p>
            <ol class="ml-5 text-[11px] text-zinc-400 leading-relaxed space-y-1">
              <li>We detect your country from your IP address</li>
              <li>Generate cryptographic ZK proof (5-10 seconds)</li>
              <li>Only your country code is revealed</li>
            </ol>
          </div>
          <div class="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <p class="text-xs text-emerald-300">
              <strong>100% Private:</strong> Uses IP-based geolocation (no GPS permissions needed). Only reveals your country code in the proof.
            </p>
          </div>
          <button type="submit" class="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors">
            Detect Country & Generate Proof
          </button>
        </form>
      `;

    case 'age':
      return `
        <form id="proof-form" class="space-y-4">
          <div>
            <label class="block mb-1.5 text-xs font-medium text-zinc-400">Birth Date</label>
            <input type="date" id="birth-date-input" required
              class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-vault-500">
          </div>
          <div>
            <label class="block mb-1.5 text-xs font-medium text-zinc-400">Minimum Age to Prove</label>
            <input type="number" id="min-age-input" value="18" min="1" max="120" required
              class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-vault-500">
          </div>
          <div class="p-3 bg-vault-500/10 border border-vault-500/30 rounded-lg">
            <p class="text-xs text-vault-300">
              <strong>Privacy:</strong> Only proves you're over the minimum age, not your exact birth date.
            </p>
          </div>
          <button type="submit"
            class="w-full py-2.5 bg-vault-500 hover:bg-vault-600 text-white rounded-lg text-sm font-semibold transition-colors">
            Generate Proof
          </button>
        </form>
      `;

    default:
      return '<p class="text-zinc-400 text-sm">Unknown proof type</p>';
  }
}

/**
 * Handle proof generation (for non-email proofs)
 */
async function handleProofGeneration(e, proofType) {
  e.preventDefault();

  // Email domain uses file upload, handled separately
  if (proofType === 'email_domain') {
    return; // File upload handler takes over
  }

  // Show loading state
  const submitButton = e.target.querySelector('button[type="submit"]');
  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.innerHTML = `
    <div class="flex items-center justify-center gap-2">
      <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
      <span>Generating...</span>
    </div>
  `;

  try {
    // Collect private data based on proof type
    let privateData;
    switch (proofType) {
      case 'country':
        // Country detection happens in background service worker (no CORS issues there)
        privateData = null; // Background will fetch country from IP
        break;

      case 'age':
        const birthDate = document.getElementById('birth-date-input').value;
        const minAge = parseInt(document.getElementById('min-age-input').value);
        privateData = {
          birthDate: birthDate,
          minAge: minAge
        };
        break;
    }

    // Send generation request to background
    const response = await chrome.runtime.sendMessage({
      action: 'generateProof',
      proofType: proofType,
      privateData: privateData
    });

    if (response.error) {
      throw new Error(response.error);
    }

    // Success!
    closeGenerateModal();
    await loadProofs(); // Refresh proofs list
    showNotification('Proof generated successfully!', 'success');

  } catch (error) {
    console.error('Error generating proof:', error);
    showNotification('Failed to generate proof: ' + error.message, 'error');
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
}

/**
 * Load and display proofs
 */
async function loadProofs() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getProofs' });

    if (response.error) {
      throw new Error(response.error);
    }

    const proofs = response.proofs || {};
    proofsList.innerHTML = '';

    if (Object.keys(proofs).length === 0) {
      proofsList.innerHTML = `
        <div class="text-center py-6 text-zinc-400 text-sm">
          No proofs generated yet. Click a button below to get started!
        </div>
      `;
      return;
    }

    // Display each proof
    for (const [type, proof] of Object.entries(proofs)) {
      const card = createProofCard(type, proof);
      proofsList.appendChild(card);
    }

  } catch (error) {
    console.error('Error loading proofs:', error);
    proofsList.innerHTML = `
      <div class="text-center py-6 text-red-400 text-sm">
        Error loading proofs: ${error.message}
      </div>
    `;
  }
}

/**
 * Create proof card element (ZK Chat style)
 */
function createProofCard(type, proof) {
  const card = document.createElement('div');
  card.className = 'mb-4';

  const isExpired = proof.expiresAt && Date.now() > proof.expiresAt;
  const generatedDate = new Date(proof.generatedAt).toLocaleDateString();

  // Truncate proof hash to first 16 and last 16 chars
  const fullHash = proof.data || 'N/A';
  const truncatedHash = fullHash.length > 32
    ? `${fullHash.substring(0, 16)}...${fullHash.substring(fullHash.length - 16)}`
    : fullHash;

  if (type === 'country') {
    const countryCode = proof.publicInputs?.countryCode || '??';
    const countryName = proof.publicInputs?.countryName || 'Unknown';
    const flag = getCountryFlag(countryCode);

    card.innerHTML = `
      <div class="p-4 bg-zinc-900/50 border border-zinc-700 rounded-xl">
        <div class="flex justify-between items-start mb-4">
          <div class="flex items-center gap-3">
            <span class="text-3xl leading-none">${flag}</span>
            <div>
              <div class="text-sm font-semibold text-white">${countryName}</div>
              <div class="text-[11px] ${isExpired ? 'text-red-400' : 'text-emerald-400'}">${isExpired ? '✗ Expired' : '✓ Verified'}</div>
            </div>
          </div>
          <div class="text-[11px] text-zinc-500">${generatedDate}</div>
        </div>

        <div class="p-3 bg-zinc-800/30 border border-zinc-700/50 rounded-lg mb-3">
          <div class="flex justify-between items-center mb-2 text-[11px] text-zinc-500">
            <span>Proof Hash</span>
            <button class="copy-hash-btn flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors" data-hash="${fullHash.replace(/"/g, '&quot;')}">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </button>
          </div>
          <code class="block font-mono text-[11px] text-emerald-400 break-all leading-relaxed">${truncatedHash}</code>
        </div>

        <div class="flex gap-2">
          <button class="share-proof-btn flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-400 rounded-lg text-xs font-medium transition-all" data-type="${type}">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>
          <button class="delete-proof-btn flex items-center justify-center gap-2 py-2 px-3 bg-transparent hover:bg-red-500/10 border border-zinc-700 hover:border-red-500 text-zinc-400 hover:text-red-400 rounded-lg text-xs font-medium transition-all" data-type="${type}">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      </div>
    `;
  } else if (type === 'email_domain') {
    const domain = proof.publicInputs?.domain || 'unknown';

    card.innerHTML = `
      <div class="p-4 bg-zinc-900/50 border border-zinc-700 rounded-xl">
        <div class="flex justify-between items-start mb-4">
          <div class="flex items-center gap-3">
            <svg class="w-8 h-8 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
            <div>
              <div class="text-sm font-semibold text-white">@${domain}</div>
              <div class="text-[11px] ${isExpired ? 'text-red-400' : 'text-emerald-400'}">${isExpired ? '✗ Expired' : '✓ Verified'}</div>
            </div>
          </div>
          <div class="text-[11px] text-zinc-500">${generatedDate}</div>
        </div>

        <div class="p-3 bg-zinc-800/30 border border-zinc-700/50 rounded-lg mb-3">
          <div class="flex justify-between items-center mb-2 text-[11px] text-zinc-500">
            <span>Proof Hash</span>
            <button class="copy-hash-btn flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors" data-hash="${fullHash.replace(/"/g, '&quot;')}">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </button>
          </div>
          <code class="block font-mono text-[11px] text-emerald-400 break-all leading-relaxed">${truncatedHash}</code>
        </div>

        <div class="flex gap-2">
          <button class="share-proof-btn flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-400 rounded-lg text-xs font-medium transition-all" data-type="${type}">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>
          <button class="delete-proof-btn flex items-center justify-center gap-2 py-2 px-3 bg-transparent hover:bg-red-500/10 border border-zinc-700 hover:border-red-500 text-zinc-400 hover:text-red-400 rounded-lg text-xs font-medium transition-all" data-type="${type}">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      </div>
    `;
  }

  // Add event listeners
  const deleteBtn = card.querySelector('.delete-proof-btn');
  const shareBtn = card.querySelector('.share-proof-btn');
  const copyHashBtn = card.querySelector('.copy-hash-btn');

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => deleteProof(type));
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', () => shareProof(type, proof));
  }

  if (copyHashBtn) {
    copyHashBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const hash = copyHashBtn.getAttribute('data-hash');
      copyToClipboard(hash);
    });
  }

  return card;
}

/**
 * Generate proof card as PNG image using Canvas API
 * Inspired by ZK Chat design - clean and professional
 */
async function generateProofCardImage(type, proof) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // High resolution canvas (3x for crisp quality)
  const displayWidth = 360;
  const displayHeight = 480;
  const scale = 3;
  const width = displayWidth * scale;  // 1080px
  const height = displayHeight * scale; // 1440px
  canvas.width = width;
  canvas.height = height;

  // Scale context for high-DPI rendering
  ctx.scale(scale, scale);

  // Background: Dark gradient (using display dimensions since we scaled context)
  const gradient = ctx.createLinearGradient(0, 0, displayWidth, displayHeight);
  gradient.addColorStop(0, '#1a1a1a');
  gradient.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, displayWidth, displayHeight);

  // Rounded corners clipping
  ctx.save();
  const cornerRadius = 24;
  ctx.beginPath();
  ctx.moveTo(cornerRadius, 0);
  ctx.lineTo(displayWidth - cornerRadius, 0);
  ctx.quadraticCurveTo(displayWidth, 0, displayWidth, cornerRadius);
  ctx.lineTo(displayWidth, displayHeight - cornerRadius);
  ctx.quadraticCurveTo(displayWidth, displayHeight, displayWidth - cornerRadius, displayHeight);
  ctx.lineTo(cornerRadius, displayHeight);
  ctx.quadraticCurveTo(0, displayHeight, 0, displayHeight - cornerRadius);
  ctx.lineTo(0, cornerRadius);
  ctx.quadraticCurveTo(0, 0, cornerRadius, 0);
  ctx.closePath();
  ctx.clip();

  // Proof type specific content
  let mainText = '';
  let icon = '';
  let subtitle = '';
  let revealsText = '';
  let hiddenText = '';

  if (type === 'email_domain') {
    const domain = proof.publicInputs?.domain || 'unknown';
    mainText = `@${domain}`;
    icon = '✉️';
    subtitle = 'Email Verified';
    revealsText = '✓ Reveals: Email Domain';
    hiddenText = '✗ Hidden: Full Email Address';
  } else if (type === 'country') {
    const countryCode = proof.publicInputs?.countryCode || '??';
    const countryName = proof.publicInputs?.countryName || 'Unknown';
    mainText = countryName;
    icon = getCountryFlag(countryCode);
    subtitle = 'Country Verified';
    revealsText = '✓ Reveals: Country';
    hiddenText = '✗ Hidden: IP, City, Exact Location';
  }

  // Large Icon/Emoji at top
  ctx.font = '48px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(icon, displayWidth / 2, 70);

  // Subtitle (verified type)
  ctx.fillStyle = '#22c55e'; // emerald-500
  ctx.font = '600 18px system-ui, -apple-system, sans-serif';
  ctx.fillText(subtitle, displayWidth / 2, 110);

  // Main text (domain or country name)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.fillText(mainText, displayWidth / 2, 145);

  // Proof Hash Box (semi-transparent background)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  const boxX = 24;
  const boxY = 170;
  const boxWidth = displayWidth - 48;
  const boxHeight = 100;
  const boxRadius = 8;

  ctx.beginPath();
  ctx.moveTo(boxX + boxRadius, boxY);
  ctx.lineTo(boxX + boxWidth - boxRadius, boxY);
  ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + boxRadius);
  ctx.lineTo(boxX + boxWidth, boxY + boxHeight - boxRadius);
  ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - boxRadius, boxY + boxHeight);
  ctx.lineTo(boxX + boxRadius, boxY + boxHeight);
  ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - boxRadius);
  ctx.lineTo(boxX, boxY + boxRadius);
  ctx.quadraticCurveTo(boxX, boxY, boxX + boxRadius, boxY);
  ctx.closePath();
  ctx.fill();

  // "Proof Hash" label
  ctx.fillStyle = '#a1a1aa'; // zinc-400
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CRYPTOGRAPHIC PROOF', displayWidth / 2, 192);

  // Hash value (word-wrapped, monospace)
  const fullHash = proof.data || '';
  ctx.fillStyle = '#4ade80'; // emerald-400
  ctx.font = '9px monospace';

  // Word wrap the hash to fit in box
  const maxCharsPerLine = 32;
  const hashLines = [];
  for (let i = 0; i < fullHash.length && hashLines.length < 3; i += maxCharsPerLine) {
    hashLines.push(fullHash.substring(i, i + maxCharsPerLine));
  }

  let yPos = 215;
  for (const line of hashLines) {
    ctx.fillText(line, displayWidth / 2, yPos);
    yPos += 14;
  }

  // Privacy info section
  ctx.fillStyle = '#71717a'; // zinc-500
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';

  ctx.fillText(revealsText, displayWidth / 2, 310);
  ctx.fillText(hiddenText, displayWidth / 2, 330);

  // Separator line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(24, 365);
  ctx.lineTo(displayWidth - 24, 365);
  ctx.stroke();

  // Footer - ZK Vault branding
  ctx.fillStyle = '#4ade80'; // emerald-400
  ctx.font = '600 13px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ZK Vault', displayWidth / 2, 395);

  ctx.fillStyle = '#71717a'; // zinc-500
  ctx.font = '10px system-ui, -apple-system, sans-serif';
  ctx.fillText('Prove Anything, Reveal Nothing', displayWidth / 2, 415);

  ctx.restore();

  // Return canvas (caller will convert to blob if needed)
  return canvas;
}

/**
 * Share proof as PNG card image
 */
async function shareProof(type, proof) {
  try {
    // Show loading notification
    showNotification('Generating proof card...', 'info');

    // Generate PNG card (returns canvas)
    const canvas = await generateProofCardImage(type, proof);

    // Show preview page with the canvas
    const page = document.getElementById('share-preview-page');
    const preview = document.getElementById('card-preview');
    preview.innerHTML = '';

    // Scale down the high-res canvas for display (maintains quality)
    // Extension is 600px tall, minus header (52px) and buttons (64px) = 484px available
    // Use 460px height to maximize space while leaving small margins
    canvas.style.width = '345px';
    canvas.style.height = '460px';
    canvas.style.display = 'block';
    canvas.style.borderRadius = '8px';
    canvas.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.3)';
    preview.appendChild(canvas);

    page.classList.remove('hidden');

    // Store blob for share/download actions (max quality)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1.0));

    // Setup event listeners for page buttons
    setupSharePreviewPage(type, blob);

  } catch (error) {
    console.error('Failed to generate proof card:', error);
    showNotification('Failed to generate proof card', 'error');
  }
}

/**
 * Setup share preview page event listeners
 */
function setupSharePreviewPage(type, blob) {
  const page = document.getElementById('share-preview-page');
  const backBtn = document.getElementById('back-to-proofs');
  const shareBtn = document.getElementById('share-card-btn');
  const downloadBtn = document.getElementById('download-card-btn');

  // Remove old listeners by cloning buttons
  const newShareBtn = shareBtn.cloneNode(true);
  const newDownloadBtn = downloadBtn.cloneNode(true);
  const newBackBtn = backBtn.cloneNode(true);
  shareBtn.replaceWith(newShareBtn);
  downloadBtn.replaceWith(newDownloadBtn);
  backBtn.replaceWith(newBackBtn);

  // Close page (go back to proofs)
  const closePage = () => {
    page.classList.add('hidden');
  };

  newBackBtn.onclick = closePage;

  // Share button
  newShareBtn.onclick = async () => {
    try {
      // Try Web Share API first (mobile/modern browsers)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], 'proof.png', { type: 'image/png' })] })) {
        const file = new File([blob], 'zk-vault-proof.png', { type: 'image/png' });

        await navigator.share({
          title: 'ZK Vault Proof',
          text: 'My zero-knowledge proof from ZK Vault',
          files: [file]
        });

        closePage();
        showNotification('Proof card shared!', 'success');
      } else {
        // Fallback message if Web Share API not available
        showNotification('Share not available - use Download instead', 'info');
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Share failed:', error);
        showNotification('Failed to share', 'error');
      }
    }
  };

  // Download button
  newDownloadBtn.onclick = () => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zk-vault-proof-${type}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    closePage();
    showNotification('Proof card downloaded!', 'success');
  };
}

/**
 * Get country flag emoji
 */
function getCountryFlag(countryCode) {
  const flags = {
    'US': '🇺🇸', 'GB': '🇬🇧', 'CA': '🇨🇦', 'AU': '🇦🇺',
    'DE': '🇩🇪', 'FR': '🇫🇷', 'JP': '🇯🇵', 'IN': '🇮🇳',
    'BR': '🇧🇷', 'CN': '🇨🇳', 'IT': '🇮🇹', 'ES': '🇪🇸',
    'MX': '🇲🇽', 'RU': '🇷🇺', 'KR': '🇰🇷', 'NL': '🇳🇱',
  };
  return flags[countryCode] || '🌍';
}

/**
 * Copy text to clipboard
 */
window.copyToClipboard = async function(text) {
  try {
    await navigator.clipboard.writeText(text);
    showNotification('Copied to clipboard!', 'success');
  } catch (error) {
    console.error('Failed to copy:', error);
    showNotification('Failed to copy', 'error');
  }
}

/**
 * Get proof icon SVG
 */
function getProofIcon(type) {
  const icons = {
    email_domain: '<svg class="w-4.5 h-4.5 text-vault-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>',
    country: '<svg class="w-4.5 h-4.5 text-vault-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    age: '<svg class="w-4.5 h-4.5 text-vault-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>'
  };
  return icons[type] || '';
}

/**
 * Delete a proof with modal confirmation
 */
async function deleteProof(type) {
  // Show delete confirmation modal
  const deleteModal = document.getElementById('delete-modal');
  const deleteModalMessage = document.getElementById('delete-modal-message');
  const deleteModalCancel = document.getElementById('delete-modal-cancel');
  const deleteModalConfirm = document.getElementById('delete-modal-confirm');

  deleteModalMessage.textContent = `Are you sure you want to delete this ${type.replace('_', ' ')} proof? This action cannot be undone.`;
  deleteModal.classList.remove('hidden');
  deleteModal.classList.add('flex');

  // Handle modal actions
  const handleCancel = () => {
    deleteModal.classList.add('hidden');
    deleteModal.classList.remove('flex');
    deleteModalCancel.removeEventListener('click', handleCancel);
    deleteModalConfirm.removeEventListener('click', handleConfirm);
    deleteModal.removeEventListener('click', handleBackdropClick);
  };

  const handleConfirm = async () => {
    deleteModal.classList.add('hidden');
    deleteModal.classList.remove('flex');
    deleteModalCancel.removeEventListener('click', handleCancel);
    deleteModalConfirm.removeEventListener('click', handleConfirm);
    deleteModal.removeEventListener('click', handleBackdropClick);

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'deleteProof',
        proofType: type
      });

      if (response.error) {
        throw new Error(response.error);
      }

      await loadProofs();
      showNotification('Proof deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting proof:', error);
      showNotification('Failed to delete proof: ' + error.message, 'error');
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === deleteModal) {
      handleCancel();
    }
  };

  deleteModalCancel.addEventListener('click', handleCancel);
  deleteModalConfirm.addEventListener('click', handleConfirm);
  deleteModal.addEventListener('click', handleBackdropClick);
}


/**
 * Load and display permissions
 */
async function loadPermissions() {
  try {
    const { zk_vault_permissions: permissions } = await chrome.storage.local.get('zk_vault_permissions');

    if (!permissions || Object.keys(permissions).length === 0) {
      permissionsList.innerHTML = '';
      noPermissions.classList.remove('hidden');
      return;
    }

    noPermissions.classList.add('hidden');
    permissionsList.innerHTML = '';

    for (const [origin, proofTypes] of Object.entries(permissions)) {
      const card = createPermissionCard(origin, proofTypes);
      permissionsList.appendChild(card);
    }

  } catch (error) {
    console.error('Error loading permissions:', error);
  }
}

/**
 * Create permission card
 */
function createPermissionCard(origin, proofTypes) {
  const card = document.createElement('div');
  card.className = 'p-3 bg-zinc-900 border border-zinc-800 rounded-lg';

  const allowedProofs = Object.entries(proofTypes)
    .filter(([_, allowed]) => allowed)
    .map(([type, _]) => type);

  card.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <h3 class="text-sm font-semibold truncate">${origin}</h3>
      <button class="revoke-permission text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors" data-origin="${origin}">
        Revoke
      </button>
    </div>
    <div class="flex flex-wrap gap-1.5">
      ${allowedProofs.map(type => `
        <span class="px-2 py-0.5 bg-vault-500 text-white rounded text-xs font-medium">
          ${type.replace(/_/g, ' ')}
        </span>
      `).join('')}
    </div>
  `;

  card.querySelector('.revoke-permission').addEventListener('click', () => revokePermission(origin));
  return card;
}

/**
 * Revoke permission for an origin
 */
async function revokePermission(origin) {
  if (!confirm(`Revoke all permissions for ${origin}?`)) {
    return;
  }

  try {
    const { zk_vault_permissions: permissions } = await chrome.storage.local.get('zk_vault_permissions');
    delete permissions[origin];
    await chrome.storage.local.set({ zk_vault_permissions: permissions });

    await loadPermissions();
    showNotification('Permission revoked', 'success');
  } catch (error) {
    console.error('Error revoking permission:', error);
    showNotification('Failed to revoke permission', 'error');
  }
}

/**
 * Setup settings handlers
 */
function setupSettings() {
  // Load current settings
  chrome.storage.local.get('zk_vault_settings', (result) => {
    const settings = result.zk_vault_settings || { expiryDays: 30, autoApprove: false };
    expiryDaysSelect.value = settings.expiryDays;
    autoApproveCheckbox.checked = settings.autoApprove;
  });

  // Save expiry days
  expiryDaysSelect.addEventListener('change', async () => {
    const { zk_vault_settings: settings } = await chrome.storage.local.get('zk_vault_settings');
    settings.expiryDays = parseInt(expiryDaysSelect.value);
    await chrome.storage.local.set({ zk_vault_settings: settings });
    showNotification('Settings saved', 'success');
  });

  // Save auto-approve
  autoApproveCheckbox.addEventListener('change', async () => {
    const { zk_vault_settings: settings } = await chrome.storage.local.get('zk_vault_settings');
    settings.autoApprove = autoApproveCheckbox.checked;
    await chrome.storage.local.set({ zk_vault_settings: settings });
    showNotification('Settings saved', 'success');
  });

  // Clear all data
  clearDataButton.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to delete ALL proofs and permissions? This cannot be undone.')) {
      return;
    }

    await chrome.storage.local.clear();
    await chrome.runtime.sendMessage({ action: 'initialize' });

    await loadProofs();
    await loadPermissions();
    showNotification('All data cleared', 'success');
  });
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  const bgColor = type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-red-600' : 'bg-emerald-500';

  notification.className = `fixed top-4 left-1/2 -translate-x-1/2 ${bgColor} text-white px-4 py-2 rounded-lg shadow-lg text-sm z-[100] transition-opacity duration-300`;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
