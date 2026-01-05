/**
 * Email Parser Library for ZK Vault
 *
 * Parses .eml files to extract DKIM signatures and email metadata
 * for zero-knowledge proof generation.
 *
 * Privacy: This module processes emails ephemerally in memory only.
 * No email content is ever stored or logged.
 */

/**
 * Main parser function - extracts all required data from raw email
 * @param {string} rawEmail - Raw .eml file content
 * @returns {Object} Parsed email data { domain, dkimSignature, authResults }
 * @throws {Error} If required headers are missing or invalid
 */
export function parseEmail(rawEmail) {
  if (!rawEmail || typeof rawEmail !== 'string') {
    throw new Error('Invalid email format: Email must be a non-empty string');
  }

  console.log('[Email Parser] Processing email...');

  const headers = parseEmailHeaders(rawEmail);

  try {
    const domain = extractDomain(headers);
    console.log('[Email Parser] Extracted domain:', domain);

    const dkimSignature = extractDKIMSignature(headers);
    console.log('[Email Parser] DKIM signature extracted');

    const authResults = extractAuthResults(headers);
    console.log('[Email Parser] Auth results extracted');

    // Validate DKIM structure before returning
    validateDKIMStructure(dkimSignature);

    return {
      domain,
      dkimSignature,
      authResults
    };
  } catch (error) {
    console.error('[Email Parser] Parsing failed:', error);
    throw error;
  }
}

/**
 * Split email into headers and body
 * @param {string} rawEmail - Raw .eml file content
 * @returns {string} Email headers only
 */
export function parseEmailHeaders(rawEmail) {
  // Headers and body are separated by double CRLF (\r\n\r\n) or double LF (\n\n)
  const headerEndIndex = rawEmail.search(/\r?\n\r?\n/);

  if (headerEndIndex === -1) {
    // No body separator found, treat entire content as headers
    return rawEmail;
  }

  return rawEmail.substring(0, headerEndIndex);
}

/**
 * Extract DKIM-Signature header from email headers
 * @param {string} headers - Email headers
 * @returns {string} DKIM signature value
 * @throws {Error} If DKIM signature not found
 */
export function extractDKIMSignature(headers) {
  // DKIM-Signature can span multiple lines (folded headers)
  // Format: DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; ...

  // Match DKIM-Signature header including folded lines (lines starting with whitespace)
  const dkimRegex = /^DKIM-Signature:\s*(.+?)(?=\r?\n(?![\t ]))/mis;
  const match = headers.match(dkimRegex);

  if (!match) {
    throw new Error('DKIM signature not found in email headers');
  }

  // Extract and clean the signature (remove newlines and extra whitespace from folding)
  let signature = match[1];
  signature = signature.replace(/\r?\n[\t ]+/g, ' '); // Unfold headers
  signature = signature.trim();

  return signature;
}

/**
 * Extract Authentication-Results header from email headers
 * @param {string} headers - Email headers
 * @returns {string} Authentication-Results value (empty string if not found)
 */
export function extractAuthResults(headers) {
  // Authentication-Results can also span multiple lines
  // Format: Authentication-Results: mx.google.com; dkim=pass ...

  const authRegex = /^Authentication-Results:\s*(.+?)(?=\r?\n(?![\t ]))/mis;
  const match = headers.match(authRegex);

  if (!match) {
    // Authentication-Results is optional, return empty string
    return '';
  }

  let authResults = match[1];
  authResults = authResults.replace(/\r?\n[\t ]+/g, ' '); // Unfold headers
  authResults = authResults.trim();

  return authResults;
}

/**
 * Extract user's email domain from headers
 * For received emails: extract from To/Delivered-To header (user is receiver)
 * For sent emails: extract from From header (user is sender)
 * @param {string} headers - Email headers
 * @returns {string} Email domain (e.g., "gmail.com")
 * @throws {Error} If headers not found or invalid
 */
export function extractDomain(headers) {
  if (!headers || typeof headers !== 'string') {
    throw new Error('Invalid email headers');
  }

  // Try To/Delivered-To first (received emails - user is receiver)
  const toRegex = /^(?:To|Delivered-To):\s*.*?<?([a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}))>?/mi;
  const toMatch = headers.match(toRegex);

  if (toMatch && toMatch[2]) {
    const domain = toMatch[2].trim();
    console.log('[Email Parser] Extracted domain from To/Delivered-To (received email):', domain);
    return domain;
  }

  // Fall back to From header (sent emails - user is sender)
  const fromRegex = /^From:\s*.*?<?([a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}))>?/mi;
  const fromMatch = headers.match(fromRegex);

  if (fromMatch && fromMatch[2]) {
    const domain = fromMatch[2].trim();
    console.log('[Email Parser] Extracted domain from From (sent email):', domain);
    return domain;
  }

  throw new Error('Could not extract email domain from To, Delivered-To, or From headers');
}

/**
 * Validate DKIM signature structure
 * @param {string} dkim - DKIM signature string
 * @throws {Error} If DKIM signature format is invalid
 */
export function validateDKIMStructure(dkim) {
  if (!dkim || typeof dkim !== 'string') {
    throw new Error('DKIM signature is empty or invalid');
  }

  // Check for required DKIM tags
  const requiredTags = ['v=', 'a=', 'd=', 'b='];
  for (const tag of requiredTags) {
    if (!dkim.includes(tag)) {
      throw new Error(`DKIM signature format invalid: missing required tag "${tag}"`);
    }
  }

  // Validate version
  if (!dkim.includes('v=1')) {
    throw new Error('DKIM signature format invalid: unsupported version (must be v=1)');
  }

  // Validate algorithm (rsa-sha256 or rsa-sha1)
  if (!dkim.includes('a=rsa-sha256') && !dkim.includes('a=rsa-sha1')) {
    throw new Error('DKIM signature format invalid: unsupported algorithm (must be rsa-sha256 or rsa-sha1)');
  }
}

/**
 * Clear email content from memory (security measure)
 * @param {Object} emailData - Object containing email data
 * @param {Array<string>} keys - Keys to clear
 */
export function clearSensitiveData(emailData, keys) {
  keys.forEach(key => {
    if (emailData && emailData[key]) {
      emailData[key] = null;
      delete emailData[key];
    }
  });
}

// Export all functions for testing and service worker usage
export default {
  parseEmail,
  parseEmailHeaders,
  extractDKIMSignature,
  extractAuthResults,
  extractDomain,
  validateDKIMStructure,
  clearSensitiveData
};
