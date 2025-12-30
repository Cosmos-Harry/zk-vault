/**
 * ZK Vault Popup JavaScript
 * Handles UI interactions and communication with background service worker
 */

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
 */
async function generateProofCardImage(type, proof) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Card dimensions (Instagram square post size)
  const width = 1080;
  const height = 1080;
  canvas.width = width;
  canvas.height = height;

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#09090b'); // zinc-950
  gradient.addColorStop(1, '#18181b'); // zinc-900
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Border
  ctx.strokeStyle = '#27272a'; // zinc-800
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, width - 60, height - 60);

  // Inner gradient accent border
  const accentGradient = ctx.createLinearGradient(0, 0, width, height);
  accentGradient.addColorStop(0, 'rgba(16, 185, 129, 0.3)'); // emerald-500/30
  accentGradient.addColorStop(1, 'rgba(16, 185, 129, 0.1)'); // emerald-500/10
  ctx.strokeStyle = accentGradient;
  ctx.lineWidth = 2;
  ctx.strokeRect(50, 50, width - 100, height - 100);

  // ZK Vault Logo/Title
  ctx.fillStyle = '#10b981'; // emerald-500
  ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🔒 ZK Vault', width / 2, 140);

  ctx.fillStyle = '#71717a'; // zinc-500
  ctx.font = '28px system-ui, -apple-system, sans-serif';
  ctx.fillText('Zero-Knowledge Proof', width / 2, 190);

  // Proof type specific content
  let mainText = '';
  let icon = '';
  let subtitle = '';

  if (type === 'email_domain') {
    const domain = proof.publicInputs?.domain || 'unknown';
    mainText = `@${domain}`;
    icon = '📧';
    subtitle = 'Email Domain Verified';
  } else if (type === 'country') {
    const countryCode = proof.publicInputs?.countryCode || '??';
    const countryName = proof.publicInputs?.countryName || 'Unknown';
    mainText = countryName;
    icon = getCountryFlag(countryCode);
    subtitle = 'Country Verified';
  }

  // Icon/Emoji
  ctx.font = '180px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(icon, width / 2, 420);

  // Main text (domain or country)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px system-ui, -apple-system, sans-serif';
  ctx.fillText(mainText, width / 2, 550);

  // Subtitle
  ctx.fillStyle = '#10b981'; // emerald-500
  ctx.font = '36px system-ui, -apple-system, sans-serif';
  ctx.fillText(subtitle, width / 2, 610);

  // Verified checkmark badge
  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)'; // emerald bg
  ctx.beginPath();
  // Rounded rectangle (fallback for older browsers)
  const x = width / 2 - 120;
  const y = 660;
  const w = 240;
  const h = 60;
  const r = 30;
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    // Manual rounded rect
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  ctx.fill();

  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
  ctx.fillText('✓ Verified', width / 2, 700);

  // Proof hash (truncated)
  const fullHash = proof.data || '';
  const truncatedHash = fullHash.length > 24
    ? `${fullHash.substring(0, 12)}...${fullHash.substring(fullHash.length - 12)}`
    : fullHash;

  ctx.fillStyle = '#3f3f46'; // zinc-700
  ctx.fillRect(120, 780, width - 240, 100);

  ctx.fillStyle = '#71717a'; // zinc-500
  ctx.font = '20px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PROOF HASH', width / 2, 815);

  ctx.fillStyle = '#10b981'; // emerald-500
  ctx.font = 'bold 24px monospace';
  ctx.fillText(truncatedHash, width / 2, 855);

  // Generated date
  const generatedDate = new Date(proof.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  ctx.fillStyle = '#52525b'; // zinc-600
  ctx.font = '24px system-ui, -apple-system, sans-serif';
  ctx.fillText(`Generated: ${generatedDate}`, width / 2, 940);

  // Footer
  ctx.fillStyle = '#3f3f46'; // zinc-700
  ctx.font = '22px system-ui, -apple-system, sans-serif';
  ctx.fillText('Privacy-preserving cryptographic verification', width / 2, 1000);

  // Convert canvas to blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/png');
  });
}

/**
 * Share proof as PNG card image
 */
async function shareProof(type, proof) {
  try {
    // Show loading notification
    showNotification('Generating proof card...', 'info');

    // Generate PNG card
    const blob = await generateProofCardImage(type, proof);

    // Try Web Share API first (mobile/modern browsers)
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], 'proof.png', { type: 'image/png' })] })) {
      const file = new File([blob], 'zk-vault-proof.png', { type: 'image/png' });

      await navigator.share({
        title: 'ZK Vault Proof',
        text: 'My zero-knowledge proof from ZK Vault',
        files: [file]
      });

      showNotification('Proof card shared!', 'success');
    } else {
      // Fallback: Download the PNG
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zk-vault-proof-${type}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showNotification('Proof card downloaded! You can now share it.', 'success');
    }
  } catch (error) {
    console.error('Failed to share proof:', error);
    showNotification('Failed to share proof card', 'error');
  }
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
 * Share a proof (copy to clipboard)
 */
async function shareProof(type, proof) {
  try {
    const proofJson = JSON.stringify(proof, null, 2);
    await navigator.clipboard.writeText(proofJson);
    showNotification('Proof copied to clipboard!', 'success');
  } catch (error) {
    console.error('Error copying proof:', error);
    showNotification('Failed to copy proof', 'error');
  }
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
