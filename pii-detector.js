/**
 * PII Detector - Local regex-based detection for sensitive data
 * Complements AI-based classification with fast, offline pattern matching
 */

const PII_PATTERNS = {
  // Contact Information
  email: {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    label: 'Email Address',
    severity: 'medium'
  },
  phone_us: {
    pattern: /\b(?:\+?1[-.\s]?)?(?:\(?[2-9]\d{2}\)?[-.\s]?)?[2-9]\d{2}[-.\s]?\d{4}\b/g,
    label: 'Phone Number (US)',
    severity: 'medium'
  },
  phone_intl: {
    pattern: /\+\d{1,3}[-.\s]?\d{1,14}/g,
    label: 'Phone Number (International)',
    severity: 'medium'
  },

  // Financial
  credit_card_visa: {
    pattern: /\b4[0-9]{12}(?:[0-9]{3})?\b/g,
    label: 'Credit Card (Visa)',
    severity: 'critical'
  },
  credit_card_mc: {
    pattern: /\b5[1-5][0-9]{14}\b/g,
    label: 'Credit Card (Mastercard)',
    severity: 'critical'
  },
  credit_card_amex: {
    pattern: /\b3[47][0-9]{13}\b/g,
    label: 'Credit Card (Amex)',
    severity: 'critical'
  },
  credit_card_discover: {
    pattern: /\b6(?:011|5[0-9]{2})[0-9]{12}\b/g,
    label: 'Credit Card (Discover)',
    severity: 'critical'
  },
  ssn: {
    pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    label: 'SSN',
    severity: 'critical',
    validate: (match) => {
      const digits = match.replace(/\D/g, '');
      if (digits.length !== 9) return false;
      // Invalid SSN patterns
      if (digits.startsWith('000') || digits.startsWith('666')) return false;
      if (digits.startsWith('9')) return false; // Reserved
      if (digits.slice(3, 5) === '00') return false;
      if (digits.slice(5) === '0000') return false;
      return true;
    }
  },
  iban: {
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g,
    label: 'IBAN',
    severity: 'high'
  },
  bank_account: {
    pattern: /\b(?:account\s*(?:number|#|no\.?)?:?\s*)(\d{8,17})\b/gi,
    label: 'Bank Account Number',
    severity: 'high'
  },

  // API Keys & Secrets
  aws_access_key: {
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    label: 'AWS Access Key',
    severity: 'critical'
  },
  aws_secret_key: {
    pattern: /\b(?:aws[_-]?secret|secret[_-]?key)[:\s]*['\"]?([A-Za-z0-9/+=]{40})['\"]?/gi,
    label: 'AWS Secret Key',
    severity: 'critical'
  },
  github_token: {
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g,
    label: 'GitHub Token',
    severity: 'critical'
  },
  github_pat_old: {
    pattern: /\bghp_[A-Za-z0-9]{36}\b/g,
    label: 'GitHub Personal Access Token',
    severity: 'critical'
  },
  openai_key: {
    pattern: /\bsk-[a-zA-Z0-9]{20,}\b/g,
    label: 'OpenAI API Key',
    severity: 'critical'
  },
  anthropic_key: {
    pattern: /\bsk-ant-[a-zA-Z0-9-]{20,}\b/g,
    label: 'Anthropic API Key',
    severity: 'critical'
  },
  slack_token: {
    pattern: /\bxox[baprs]-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{20,}\b/g,
    label: 'Slack Token',
    severity: 'critical'
  },
  slack_webhook: {
    pattern: /\bhttps:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[a-zA-Z0-9]+\b/g,
    label: 'Slack Webhook URL',
    severity: 'critical'
  },
  stripe_key: {
    pattern: /\b(?:sk|pk)_(?:test|live)_[a-zA-Z0-9]{24,}\b/g,
    label: 'Stripe API Key',
    severity: 'critical'
  },
  google_api_key: {
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    label: 'Google API Key',
    severity: 'critical'
  },
  firebase_key: {
    pattern: /\bAAAA[A-Za-z0-9_-]{7}:[A-Za-z0-9_-]{140}\b/g,
    label: 'Firebase Server Key',
    severity: 'critical'
  },
  sendgrid_key: {
    pattern: /\bSG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}\b/g,
    label: 'SendGrid API Key',
    severity: 'critical'
  },
  twilio_key: {
    pattern: /\bSK[a-f0-9]{32}\b/g,
    label: 'Twilio API Key',
    severity: 'critical'
  },
  npm_token: {
    pattern: /\bnpm_[a-zA-Z0-9]{36}\b/g,
    label: 'NPM Token',
    severity: 'critical'
  },
  jwt_token: {
    pattern: /\beyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    label: 'JWT Token',
    severity: 'high'
  },
  generic_api_key: {
    pattern: /\b(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|bearer)[:\s=]+['\"]?([a-zA-Z0-9_\-]{20,})['\"]?/gi,
    label: 'API Key (Generic)',
    severity: 'high'
  },
  generic_password: {
    pattern: /\b(?:password|passwd|pwd)[:\s=]+['\"]?([^\s'\"]{8,})['\"]?/gi,
    label: 'Password',
    severity: 'critical'
  },
  generic_secret: {
    pattern: /\b(?:secret|private[_-]?key)[:\s=]+['\"]?([a-zA-Z0-9_\-/+=]{16,})['\"]?/gi,
    label: 'Secret/Private Key',
    severity: 'critical'
  },

  // Cryptographic Keys
  private_key_pem: {
    pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    label: 'Private Key (PEM)',
    severity: 'critical'
  },
  ssh_private_key: {
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
    label: 'SSH Private Key',
    severity: 'critical'
  },

  // Network/Infrastructure
  ip_address_public: {
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    label: 'IP Address',
    severity: 'low',
    validate: (match) => {
      // Exclude private/local IP ranges
      if (match.startsWith('127.')) return false;
      if (match.startsWith('192.168.')) return false;
      if (match.startsWith('10.')) return false;
      if (match.startsWith('172.')) {
        const second = parseInt(match.split('.')[1], 10);
        if (second >= 16 && second <= 31) return false;
      }
      if (match.startsWith('0.') || match.startsWith('255.')) return false;
      return true;
    }
  },
  database_url: {
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|mssql):\/\/[^\s'"]+/gi,
    label: 'Database Connection String',
    severity: 'critical'
  },

  // Personal Identification
  drivers_license: {
    pattern: /\b(?:driver'?s?\s*(?:license|lic\.?)\s*(?:number|#|no\.?)?:?\s*)([A-Z]{1,2}[0-9]{5,8})\b/gi,
    label: "Driver's License",
    severity: 'high'
  },
  passport_number: {
    pattern: /\b(?:passport\s*(?:number|#|no\.?)?:?\s*)([A-Z]{1,2}[0-9]{6,9})\b/gi,
    label: 'Passport Number',
    severity: 'high'
  },
  national_id: {
    pattern: /\b(?:national\s*id|citizen\s*id|id\s*number)\s*(?:#|no\.?)?:?\s*([A-Z0-9]{6,15})\b/gi,
    label: 'National ID',
    severity: 'high'
  },

  // Personal Data
  date_of_birth: {
    pattern: /\b(?:dob|date\s*of\s*birth|birthday|born)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/gi,
    label: 'Date of Birth',
    severity: 'medium'
  },
  address_us: {
    pattern: /\b\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way|place|pl)\.?\s*,?\s*[\w\s]+,?\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?\b/gi,
    label: 'US Street Address',
    severity: 'medium'
  },
  zip_code_context: {
    pattern: /\b(?:zip\s*(?:code)?|postal\s*code)\s*:?\s*(\d{5}(?:-\d{4})?)\b/gi,
    label: 'ZIP Code',
    severity: 'low'
  }
};

/**
 * Scan text for PII patterns
 * @param {string} text - Text to scan
 * @returns {Array} Array of detected PII items
 */
function detectPII(text) {
  if (!text || typeof text !== 'string') return [];

  const detections = [];

  for (const [type, config] of Object.entries(PII_PATTERNS)) {
    // Reset regex lastIndex for global patterns
    config.pattern.lastIndex = 0;

    let match;
    while ((match = config.pattern.exec(text)) !== null) {
      const value = match[1] || match[0]; // Use capture group if present

      // Run validation if defined
      if (config.validate && !config.validate(value)) {
        continue;
      }

      detections.push({
        type,
        label: config.label,
        severity: config.severity,
        value: maskSensitiveValue(value, type),
        rawLength: value.length,
        position: match.index,
        length: match[0].length
      });
    }
  }

  // Deduplicate overlapping detections (prefer higher severity)
  return deduplicateDetections(detections);
}

/**
 * Mask sensitive values for display (show first/last few chars)
 * @param {string} value - The raw value
 * @param {string} type - The PII type
 * @returns {string} Masked value safe for display
 */
function maskSensitiveValue(value, type) {
  if (!value) return '***';

  // Email - show part of local and domain
  if (type === 'email') {
    const [local, domain] = value.split('@');
    if (local && domain) {
      const maskedLocal = local.length > 2 ? `${local.slice(0, 2)}***` : '***';
      return `${maskedLocal}@${domain}`;
    }
    return '***@***';
  }

  // Credit cards and SSN - show last 4
  if (type.includes('credit_card') || type === 'ssn') {
    return `***${value.slice(-4)}`;
  }

  // API keys and tokens - show first and last 4
  if (type.includes('key') || type.includes('token') || type.includes('secret')) {
    if (value.length > 12) {
      return `${value.slice(0, 4)}...${value.slice(-4)}`;
    }
    return `${value.slice(0, 2)}***`;
  }

  // Private keys - just indicate presence
  if (type.includes('private_key') || type.includes('ssh')) {
    return '[PRIVATE KEY]';
  }

  // Database URLs - show protocol and mask credentials
  if (type === 'database_url') {
    try {
      const match = value.match(/^(\w+):\/\/([^:]+):([^@]+)@(.+)$/);
      if (match) {
        return `${match[1]}://***:***@${match[4].slice(0, 20)}...`;
      }
    } catch {
      // Fall through to generic masking
    }
  }

  // Passwords - never show
  if (type.includes('password')) {
    return '********';
  }

  // Generic masking for other types
  if (value.length > 10) {
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }
  if (value.length > 4) {
    return `${value.slice(0, 2)}***`;
  }
  return '***';
}

/**
 * Remove overlapping detections, keeping higher severity ones
 * @param {Array} detections - Raw detections array
 * @returns {Array} Deduplicated detections
 */
function deduplicateDetections(detections) {
  const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };

  // Sort by position, then by severity (higher first)
  detections.sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return severityOrder[b.severity] - severityOrder[a.severity];
  });

  const result = [];
  let lastEnd = -1;

  for (const detection of detections) {
    // Skip if this detection overlaps with a previous one
    if (detection.position < lastEnd) {
      continue;
    }
    result.push(detection);
    lastEnd = detection.position + detection.length;
  }

  return result;
}

/**
 * Summarize PII detections by severity and type
 * @param {Array} detections - Array of detected PII items
 * @returns {Object} Summary with counts by severity and type
 */
function summarizePII(detections) {
  const summary = {
    total: detections.length,
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    byType: {},
    hasCritical: false,
    hasSecrets: false,
    hasPersonalInfo: false,
    hasFinancial: false
  };

  for (const d of detections) {
    summary.bySeverity[d.severity]++;
    summary.byType[d.type] = (summary.byType[d.type] || 0) + 1;

    // Set flags for quick checks
    if (d.severity === 'critical') {
      summary.hasCritical = true;
    }
    if (d.type.includes('key') || d.type.includes('token') || d.type.includes('secret') || d.type.includes('password')) {
      summary.hasSecrets = true;
    }
    if (d.type === 'email' || d.type.includes('phone') || d.type === 'ssn' || d.type.includes('address') || d.type.includes('passport') || d.type.includes('license')) {
      summary.hasPersonalInfo = true;
    }
    if (d.type.includes('credit_card') || d.type.includes('bank') || d.type === 'iban') {
      summary.hasFinancial = true;
    }
  }

  return summary;
}

/**
 * Quick check if text likely contains PII (for filtering)
 * @param {string} text - Text to check
 * @returns {boolean} True if text likely contains PII
 */
function quickPIICheck(text) {
  if (!text || typeof text !== 'string') return false;

  // Quick patterns for common PII indicators
  const quickPatterns = [
    /@[a-z0-9.-]+\.[a-z]{2,}/i,  // Email-like
    /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/,  // SSN-like
    /\b4\d{15}\b/,  // Visa-like
    /\bsk-[a-zA-Z0-9]{20,}/,  // OpenAI key
    /\bAKIA[0-9A-Z]{16}/,  // AWS key
    /\bgh[pousr]_/,  // GitHub token
    /-----BEGIN.*PRIVATE KEY/,  // Private key
    /\b(?:password|passwd|secret|api[_-]?key)\s*[:=]/i  // Config patterns
  ];

  return quickPatterns.some(pattern => pattern.test(text));
}

// Export for use in background.js and UI
export { detectPII, summarizePII, quickPIICheck, PII_PATTERNS };
