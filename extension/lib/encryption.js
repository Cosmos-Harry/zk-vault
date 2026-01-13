/**
 * Encryption utilities for securing sensitive data in storage
 * Uses Web Crypto API with AES-GCM encryption
 */

// Generate a device-specific key from browser fingerprint
async function getDeviceKey() {
  const encoder = new TextEncoder();

  // Create a fingerprint from browser/device characteristics
  // Use only APIs available in both service worker and window contexts
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 'unknown',
    // Only use screen/deviceMemory if available (not in service workers)
    typeof screen !== 'undefined' ? screen.width : 'sw',
    typeof screen !== 'undefined' ? screen.height : 'sw',
    navigator.deviceMemory || 'unknown'
  ].join('|');

  // Hash the fingerprint to create consistent key material
  const fingerprintData = encoder.encode(fingerprint);
  const hashBuffer = await crypto.subtle.digest('SHA-256', fingerprintData);

  return hashBuffer;
}

// Derive encryption key from device key
async function deriveKey(keyMaterial) {
  const encoder = new TextEncoder();
  const salt = encoder.encode('zk-vault-encryption-salt-v1');

  const baseKey = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return key;
}

/**
 * Encrypt a string value
 * @param {string} plaintext - The value to encrypt
 * @returns {Promise<{encrypted: number[], iv: number[]}>} Encrypted data and IV
 */
export async function encryptValue(plaintext) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Get device-specific key
  const keyMaterial = await getDeviceKey();
  const key = await deriveKey(keyMaterial);

  // Generate random IV for this encryption
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the data
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    data
  );

  // Convert to arrays for JSON serialization
  return {
    encrypted: Array.from(new Uint8Array(encrypted)),
    iv: Array.from(iv),
    version: 1 // For future migration if we change encryption method
  };
}

/**
 * Decrypt an encrypted value
 * @param {{encrypted: number[], iv: number[], version?: number}} encryptedData - The encrypted data object
 * @returns {Promise<string>} Decrypted plaintext
 */
export async function decryptValue(encryptedData) {
  if (!encryptedData || !encryptedData.encrypted || !encryptedData.iv) {
    throw new Error('Invalid encrypted data format');
  }

  // Get device-specific key (same as encryption)
  const keyMaterial = await getDeviceKey();
  const key = await deriveKey(keyMaterial);

  // Convert arrays back to Uint8Arrays
  const encryptedBuffer = new Uint8Array(encryptedData.encrypted);
  const iv = new Uint8Array(encryptedData.iv);

  // Decrypt the data
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    encryptedBuffer
  );

  // Convert back to string
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Check if a value is encrypted (has the expected format)
 * @param {any} value - The value to check
 * @returns {boolean} True if the value appears to be encrypted
 */
export function isEncrypted(value) {
  return (
    value &&
    typeof value === 'object' &&
    Array.isArray(value.encrypted) &&
    Array.isArray(value.iv) &&
    value.encrypted.length > 0 &&
    value.iv.length === 12
  );
}
