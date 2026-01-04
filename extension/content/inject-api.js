/**
 * ZK Vault Content Script
 * Injects the window.zkVault API into websites
 */

(function() {
  'use strict';

  console.log('[ZK Vault] Injecting API...');

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

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'requestProof',
          requestId: crypto.randomUUID(),
          proofType: config.type,
          origin: window.location.origin,
          autoRegister: config.autoRegister || false,
          backendUrl: config.backendUrl || null,
          permissionMessage: config.permissionMessage || null,
          timestamp: Date.now()
        });

        if (response.error) {
          throw new Error(response.error);
        }

        return response;  // {success, proof, registration?}
      } catch (error) {
        console.error('[ZK Vault] Request failed:', error);
        throw error;
      }
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
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'getProofs'
        });

        if (response.error) {
          return false;
        }

        return !!response.proofs[proofType];
      } catch (error) {
        console.error('[ZK Vault] Failed to check proof:', error);
        return false;
      }
    },

    /**
     * Open vault popup to manage proofs
     */
    openVault: function() {
      chrome.runtime.sendMessage({ action: 'openPopup' });
    }
  };

  // Dispatch event to notify page that zkVault is ready
  window.dispatchEvent(new CustomEvent('zkVaultReady', {
    detail: { version: '0.1.3' }
  }));

  console.log('[ZK Vault] API injected successfully');
})();
