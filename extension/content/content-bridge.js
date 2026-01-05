/**
 * ZK Vault Content Script Bridge (runs in ISOLATED world)
 * Forwards messages between page context and background service worker
 */

(function() {
  'use strict';

  console.log('[ZK Vault] Content script bridge established');

  // Listen for messages from page and forward to background
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
})();
