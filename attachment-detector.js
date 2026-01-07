/**
 * Attachment Type Detection
 * Detects types of content/attachments in thread messages
 */

// Code detection patterns
const codePatterns = [
  /```[\w-]*\n/,                           // Markdown code blocks
  /language-([\w-]+)/,                     // Code block language classes
  /\bfunction\s+\w+\s*\(/,                 // Function definitions
  /\bconst\s+\w+\s*=/,                     // Variable declarations
  /\bdef\s+\w+\s*\(/,                      // Python functions
  /\bclass\s+\w+/,                         // Class definitions
  /import\s+[\w{}\s,]+\s+from/,            // ES6 imports
  /require\s*\(\s*['"][^'"]+['"]\s*\)/,    // CommonJS requires
];

// HTML detection patterns
const htmlPatterns = [
  /<!DOCTYPE\s+html/i,
  /<html[\s>]/i,
  /<head[\s>]/i,
  /<body[\s>]/i,
  /<div[\s>]/i,
  /<script[\s>]/i,
  /<style[\s>]/i,
];

// Data structure patterns (JSON, CSV, etc.)
const dataPatterns = [
  /^\s*\{[\s\S]*"[\w]+"\s*:/m,             // JSON objects
  /^\s*\[[\s\S]*\{/m,                      // JSON arrays of objects
  /^[\w]+,[\w]+,[\w]+/m,                   // CSV headers
];

// Image patterns in text
const imagePatterns = [
  /\[Image:/i,                             // [Image: description]
  /!\[.*?\]\(.*?\)/,                       // Markdown images
  /data:image\//,                          // Base64 images
  /\.(png|jpg|jpeg|gif|svg|webp)/i,        // Image file references
];

// Document/markdown patterns
const docPatterns = [
  /^#{1,6}\s+.+$/m,                        // Markdown headers
  /^\s*[-*]\s+.+$/m,                       // Bullet lists
  /^\s*\d+\.\s+.+$/m,                      // Numbered lists
  /\*\*[^*]+\*\*/,                         // Bold text
  /\[.+?\]\(.+?\)/,                        // Markdown links
];

/**
 * Detect attachment types from messages and artifacts
 * Returns an array of detected types: 'code', 'doc', 'html', 'image', 'data'
 * @param {Array} messages - Array of message objects with text content
 * @param {Array} artifacts - Array of artifact objects (optional)
 * @returns {string[]} Array of unique attachment type strings
 */
export function detectAttachmentTypes(messages = [], artifacts = []) {
  const types = new Set();

  // Check messages
  for (const msg of messages) {
    const text = msg.text || '';

    // Check for code
    if (codePatterns.some(p => p.test(text))) {
      types.add('code');
    }

    // Check for HTML
    if (htmlPatterns.some(p => p.test(text))) {
      types.add('html');
    }

    // Check for structured data
    if (dataPatterns.some(p => p.test(text))) {
      types.add('data');
    }

    // Check for images
    if (imagePatterns.some(p => p.test(text))) {
      types.add('image');
    }

    // Check for document/markdown content (only if substantial)
    if (text.length > 200 && docPatterns.some(p => p.test(text))) {
      types.add('doc');
    }
  }

  // Check artifacts
  for (const artifact of artifacts) {
    const type = (artifact.type || '').toLowerCase();
    const label = (artifact.label || '').toLowerCase();
    const content = artifact.content || '';

    // Map artifact types to our categories
    if (type === 'code' || type.includes('code') || /\.(js|ts|py|java|go|rs|c|cpp|rb|php)$/i.test(label)) {
      types.add('code');
    }

    if (type === 'document' || type === 'text' || type.includes('markdown') || /\.md$/i.test(label)) {
      types.add('doc');
    }

    if (type === 'html' || type.includes('html') || /\.html?$/i.test(label)) {
      types.add('html');
    }

    if (type.includes('image') || /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(label)) {
      types.add('image');
    }

    if (type === 'json' || type === 'csv' || type.includes('data') || /\.(json|csv|xml)$/i.test(label)) {
      types.add('data');
    }

    // Also scan artifact content
    if (content) {
      if (codePatterns.some(p => p.test(content))) types.add('code');
      if (htmlPatterns.some(p => p.test(content))) types.add('html');
    }
  }

  return Array.from(types);
}

/**
 * Get icon for attachment type
 * @param {string} type - Attachment type
 * @returns {string} Icon character
 */
export function getAttachmentIcon(type) {
  const icons = {
    code: '{ }',
    doc: '📄',
    html: '🌐',
    image: '🖼',
    data: '📊',
  };
  return icons[type] || '📎';
}

/**
 * Get all attachment icons as HTML badges
 * @param {string[]} types - Array of attachment types
 * @returns {string} HTML string with icon badges
 */
export function getAttachmentBadges(types = []) {
  if (!types || types.length === 0) return '';

  return types.map(type => {
    const icon = getAttachmentIcon(type);
    return `<span class="attachment-badge attachment-${type}" title="${type}">${icon}</span>`;
  }).join('');
}
