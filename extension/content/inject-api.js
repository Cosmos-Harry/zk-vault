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
     * @param {string} proofType - Type of proof ('email_domain', 'country', 'age')
     * @returns {Promise<Object>} The proof object or null if denied
     */
    requestProof: async function(proofType) {
      console.log('[ZK Vault] Proof requested:', proofType);

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'requestProof',
          proofType: proofType
        });

        if (response.error) {
          console.error('[ZK Vault] Error:', response.error);
          return null;
        }

        return response.proof;
      } catch (error) {
        console.error('[ZK Vault] Request failed:', error);
        return null;
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
      return '0.1.0';
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
    detail: { version: '0.1.0' }
  }));

  console.log('[ZK Vault] API injected successfully');
})();
