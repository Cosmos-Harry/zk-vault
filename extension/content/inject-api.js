/**
 * ZK Vault Content Script
 * Injects the window.zkVault API into websites
 */

(function() {
  'use strict';

  console.log('[ZK Vault] Injecting API via script injection...');

  // Create and inject a script element to run in the page context
  const script = document.createElement('script');
  script.textContent = `
  (function() {
    console.log('[ZK Vault] Setting up window.zkVault in page context...');

    /**
     * Main ZK Vault API exposed to websites
     */
    window.zkVault = {
      /**
       * Request a proof from the vault
       * @param {string|Object} options - Proof type string OR config object {type, autoRegister, backendUrl}
       * @returns {Promise<Object>} The proof object (and registration if autoRegister=true) or error
       */
      requestProof: async function(options) {
        // Normalize options (backward compatible with string parameter)
        const config = typeof options === 'string'
          ? { type: options }
          : options;

        // Validate config
        if (!config.type) {
          throw new Error('Proof type is required');
        }

        if (config.autoRegister && !config.backendUrl) {
          throw new Error('backendUrl is required when autoRegister=true');
        }

        console.log('[ZK Vault] Proof requested:', config);

        // Use postMessage to communicate with content script
        return new Promise((resolve, reject) => {
          const requestId = crypto.randomUUID();

          // Listen for response
          const responseHandler = (event) => {
            if (event.source !== window) return;
            if (event.data.type !== 'ZK_VAULT_RESPONSE') return;
            if (event.data.requestId !== requestId) return;

            window.removeEventListener('message', responseHandler);

            if (event.data.error) {
              reject(new Error(event.data.error));
            } else {
              resolve(event.data.response);
            }
          };

          window.addEventListener('message', responseHandler);

          // Send request to content script
          window.postMessage({
            type: 'ZK_VAULT_REQUEST',
            requestId: requestId,
            action: 'requestProof',
            data: {
              proofType: config.type,
              origin: window.location.origin,
              autoRegister: config.autoRegister || false,
              backendUrl: config.backendUrl || null,
              permissionMessage: config.permissionMessage || null,
              timestamp: Date.now()
            }
          }, '*');

          // Timeout after 5 minutes (proof generation can take time)
          setTimeout(() => {
            window.removeEventListener('message', responseHandler);
            reject(new Error('Request timeout'));
          }, 300000);
        });
      },

      /**
       * Check if vault is installed and ready
       * @returns {boolean} True if vault is available
       */
      isInstalled: function() {
        return true;
      },

      /**
       * Get vault version
       * @returns {string} Version string
       */
      getVersion: function() {
        return '0.1.3';
      },

      /**
       * Check if a specific proof exists
       * @param {string} proofType - Type of proof to check
       * @returns {Promise<boolean>} True if proof exists
       */
      hasProof: async function(proofType) {
        return new Promise((resolve, reject) => {
          const requestId = crypto.randomUUID();

          const responseHandler = (event) => {
            if (event.source !== window) return;
            if (event.data.type !== 'ZK_VAULT_RESPONSE') return;
            if (event.data.requestId !== requestId) return;

            window.removeEventListener('message', responseHandler);

            if (event.data.error) {
              resolve(false);
            } else {
              resolve(!!event.data.response?.proofs?.[proofType]);
            }
          };

          window.addEventListener('message', responseHandler);

          window.postMessage({
            type: 'ZK_VAULT_REQUEST',
            requestId: requestId,
            action: 'getProofs',
            data: {}
          }, '*');

          setTimeout(() => {
            window.removeEventListener('message', responseHandler);
            resolve(false);
          }, 5000);
        });
      },

      /**
       * Open vault popup to manage proofs
       */
      openVault: function() {
        window.postMessage({
          type: 'ZK_VAULT_REQUEST',
          requestId: crypto.randomUUID(),
          action: 'openPopup',
          data: {}
        }, '*');
      }
    };

    // Dispatch event to notify page that zkVault is ready
    window.dispatchEvent(new CustomEvent('zkVaultReady', {
      detail: { version: '0.1.3' }
    }));

    console.log('[ZK Vault] API injected successfully');
  })();
  `;

  // Inject the script into the page
  (document.head || document.documentElement).appendChild(script);
  script.remove();

  // Content script: Listen for messages from page and forward to background
  window.addEventListener('message', async (event) => {
    // Only accept messages from same window
    if (event.source !== window) return;

    // Only handle ZK Vault requests
    if (event.data.type !== 'ZK_VAULT_REQUEST') return;

    const { requestId, action, data } = event.data;

    try {
      // Forward to background script
      const response = await chrome.runtime.sendMessage({
        action: action,
        requestId: requestId,
        ...data
      });

      // Send response back to page
      window.postMessage({
        type: 'ZK_VAULT_RESPONSE',
        requestId: requestId,
        response: response,
        error: response.error || null
      }, '*');
    } catch (error) {
      // Send error back to page
      window.postMessage({
        type: 'ZK_VAULT_RESPONSE',
        requestId: requestId,
        response: null,
        error: error.message
      }, '*');
    }
  });

  console.log('[ZK Vault] Content script bridge established');
})();
