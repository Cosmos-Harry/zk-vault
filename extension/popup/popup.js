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
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active tab content
      tabContents.forEach(content => {
        if (content.id === `${targetTab}-tab`) {
          content.style.display = 'block';
        } else {
          content.style.display = 'none';
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
  generateModal.style.display = 'flex';

  // Setup form submission
  const form = modalBody.querySelector('form');
  if (form) {
    form.addEventListener('submit', (e) => handleProofGeneration(e, proofType));
  }
}

/**
 * Close proof generation modal
 */
function closeGenerateModal() {
  generateModal.style.display = 'none';
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
          <div>
            <label class="block mb-1.5 text-xs font-medium text-zinc-400">Email Address</label>
            <input type="email" id="email-input" required
              class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-vault-500"
              placeholder="your.email@example.com">
            <p class="mt-1.5 text-xs text-zinc-400">We'll fetch DKIM signature from your Gmail account</p>
          </div>
          <div class="p-3 bg-vault-500/10 border border-vault-500/30 rounded-lg">
            <p class="text-xs text-vault-300">
              <strong>Privacy:</strong> Your email stays private. Only your domain will be revealed.
            </p>
          </div>
          <button type="submit"
            class="w-full py-2.5 bg-vault-500 hover:bg-vault-600 text-white rounded-lg text-sm font-semibold transition-colors">
            Connect Gmail & Generate
          </button>
        </form>
      `;

    case 'country':
      return `
        <form id="proof-form">
          <div class="info-box" style="margin-bottom: 16px;">
            <p style="margin-bottom: 8px;"><strong>How it works:</strong></p>
            <ol style="margin-left: 20px; font-size: 11px; line-height: 1.6;">
              <li>We detect your country from your IP address</li>
              <li>Generate cryptographic ZK proof (5-10 seconds)</li>
              <li>Only your country code is revealed</li>
            </ol>
          </div>
          <div class="info-box" style="margin-bottom: 16px; background: rgba(34, 197, 94, 0.1); border-color: rgba(34, 197, 94, 0.3);">
            <p class="text-xs">
              <strong>100% Private:</strong> Uses IP-based geolocation (no GPS permissions needed). Only reveals your country code in the proof.
            </p>
          </div>
          <button type="submit" class="btn-primary">
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
 * Handle proof generation
 */
async function handleProofGeneration(e, proofType) {
  e.preventDefault();

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
      case 'email_domain':
        const email = document.getElementById('email-input').value;
        // TODO: Actually fetch DKIM signature from Gmail
        privateData = {
          email: email,
          dkimSignature: 'MOCK_DKIM_SIGNATURE'
        };
        break;

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
  card.className = 'proof-result-section';

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
      <div class="proof-result-content">
        <div class="proof-result-header">
          <div class="proof-result-info">
            <span class="proof-country-flag">${flag}</span>
            <div>
              <div class="proof-country-name">${countryName}</div>
              <div class="proof-verified">${isExpired ? '✗ Expired' : '✓ Verified'}</div>
            </div>
          </div>
          <div class="proof-date">${generatedDate}</div>
        </div>

        <div class="proof-hash-section">
          <div class="proof-hash-label">
            <span>Proof Hash</span>
            <button class="copy-btn" onclick="event.stopPropagation(); window.copyToClipboard('${fullHash.replace(/'/g, "\\'")}')">
              <svg class="copy-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </button>
          </div>
          <code class="proof-hash">${truncatedHash}</code>
        </div>

        <div class="proof-actions">
          <button class="delete-proof-btn" data-type="${type}">
            <svg class="action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Proof
          </button>
        </div>
      </div>
    `;
  } else if (type === 'email_domain') {
    const domain = proof.publicInputs?.domain || 'unknown';

    card.innerHTML = `
      <div class="proof-result-content">
        <div class="proof-result-header">
          <div class="proof-result-info">
            <span class="proof-country-flag">✉️</span>
            <div>
              <div class="proof-country-name">@${domain}</div>
              <div class="proof-verified">${isExpired ? '✗ Expired' : '✓ Verified'}</div>
            </div>
          </div>
          <div class="proof-date">${generatedDate}</div>
        </div>

        <div class="proof-hash-section">
          <div class="proof-hash-label">
            <span>Proof Hash</span>
            <button class="copy-btn" onclick="event.stopPropagation(); window.copyToClipboard('${fullHash.replace(/'/g, "\\'")}')">
              <svg class="copy-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </button>
          </div>
          <code class="proof-hash">${truncatedHash}</code>
        </div>

        <div class="proof-actions">
          <button class="delete-proof-btn" data-type="${type}">
            <svg class="action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Proof
          </button>
        </div>
      </div>
    `;
  }

  // Add event listeners
  card.querySelector('.delete-proof-btn').addEventListener('click', () => deleteProof(type));

  return card;
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
 * Delete a proof
 */
async function deleteProof(type) {
  if (!confirm('Are you sure you want to delete this proof?')) {
    return;
  }

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
      noPermissions.style.display = 'block';
      return;
    }

    noPermissions.style.display = 'none';
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
  const bgColor = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-vault-500';

  notification.className = `fixed top-4 left-1/2 transform -translate-x-1/2 ${bgColor} text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50 transition-opacity`;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
