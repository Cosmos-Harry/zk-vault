/**
 * ZK Vault Page Script (runs in MAIN world)
 * Exposes window.zkVault API to websites
 */

(function() {
  'use strict';

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
      return '0.1.6';
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
    detail: { version: '0.1.6' }
  }));

  console.log('[ZK Vault] API injected successfully');
})();
