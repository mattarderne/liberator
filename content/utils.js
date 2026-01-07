/**
 * Shared utilities for content scripts
 * Provides robust extraction patterns inspired by chat-export
 */

/**
 * Scroll element into view and wait for content to load
 * @param {Element} element - Element to scroll into view
 * @param {Object} options - Scroll options
 * @param {number} delay - Wait time in ms after scroll (default 500ms)
 * @returns {Promise<void>}
 */
async function scrollIntoViewAndWait(element, options = {}, delay = 500) {
  const { block = 'center', behavior = 'smooth' } = options;
  element.scrollIntoView({ behavior, block });
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Extract formatted text from an element, preserving markdown structure
 * @param {Element} element - DOM element to extract text from
 * @returns {string} Formatted text with markdown preserved
 */
function extractFormattedText(element) {
  // Clone to avoid modifying the actual DOM
  const clone = element.cloneNode(true);

  // Remove unwanted elements (buttons, icons, etc.)
  clone.querySelectorAll('button, [role="button"], svg, .copy-button, [class*="copy"]').forEach((el) => el.remove());

  // Process code blocks to preserve formatting
  clone.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    if (code) {
      // Extract language from class (e.g., "language-javascript")
      const langClass = Array.from(code.classList).find((c) => c.startsWith('language-'));
      const lang = langClass ? langClass.replace('language-', '') : '';

      // Get raw code text
      const codeText = code.textContent || '';

      // Replace pre with markdown code block
      const placeholder = document.createElement('span');
      placeholder.textContent = `\n\`\`\`${lang}\n${codeText}\n\`\`\`\n`;
      pre.replaceWith(placeholder);
    }
  });

  // Process inline code
  clone.querySelectorAll('code:not(pre code)').forEach((code) => {
    const text = code.textContent || '';
    code.textContent = `\`${text}\``;
  });

  // Process headers
  ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach((tag, i) => {
    clone.querySelectorAll(tag).forEach((h) => {
      const prefix = '#'.repeat(i + 1);
      h.textContent = `\n${prefix} ${h.textContent}\n`;
    });
  });

  // Process lists
  clone.querySelectorAll('li').forEach((li) => {
    const parent = li.parentElement;
    const isOrdered = parent?.tagName === 'OL';
    const index = Array.from(parent?.children || []).indexOf(li) + 1;
    const prefix = isOrdered ? `${index}. ` : '- ';
    li.textContent = prefix + li.textContent;
  });

  // Process bold/strong
  clone.querySelectorAll('strong, b').forEach((el) => {
    el.textContent = `**${el.textContent}**`;
  });

  // Process italic/em
  clone.querySelectorAll('em, i').forEach((el) => {
    el.textContent = `*${el.textContent}*`;
  });

  // Process links
  clone.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href');
    const text = a.textContent;
    if (href && text) {
      a.textContent = `[${text}](${href})`;
    }
  });

  // Process blockquotes
  clone.querySelectorAll('blockquote').forEach((bq) => {
    const lines = bq.textContent?.split('\n') || [];
    bq.textContent = lines.map((line) => `> ${line}`).join('\n');
  });

  // Get final text
  let text = clone.innerText || clone.textContent || '';

  // Clean up extra whitespace while preserving intentional newlines
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

/**
 * Clean up code blocks - fix duplicated language labels
 * e.g., "javascript```javascript" -> "```javascript"
 * @param {string} content - Text content to clean
 * @returns {string} Cleaned content
 */
function cleanupCodeBlocks(content) {
  // Fix duplicated language labels (e.g., "bash```bash" -> "```bash")
  return content.replace(/([a-zA-Z0-9_+-]+)\s*```\1\b/g, '```$1');
}

/**
 * Copy content via clipboard by clicking a copy button
 * @param {Element} copyButton - Button element to click
 * @param {number} delay - Wait time after click (default 150ms)
 * @returns {Promise<string|null>} Clipboard content or null on failure
 */
async function copyViaClipboard(copyButton, delay = 150) {
  if (!copyButton) return null;

  try {
    copyButton.click();
    await new Promise((resolve) => setTimeout(resolve, delay));
    const content = await navigator.clipboard.readText();
    return content || null;
  } catch (err) {
    console.warn('Clipboard read failed:', err);
    return null;
  }
}

/**
 * Wait for an element to appear in the DOM
 * @param {string} selector - CSS selector
 * @param {Element} parent - Parent element to search within (default document)
 * @param {number} timeout - Max wait time in ms (default 5000)
 * @returns {Promise<Element|null>} Element or null if not found
 */
async function waitForElement(selector, parent = document, timeout = 5000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const element = parent.querySelector(selector);
    if (element) return element;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return null;
}

/**
 * Remove source citations from ChatGPT content
 * @param {Element} element - Element to clean (should be cloned first)
 */
function removeSourceCitations(element) {
  // Remove source link spans: span[data-state] > span > a[target="_blank"]
  const sourceSpans = Array.from(element.querySelectorAll('span[data-state]')).filter((span) => {
    return !!span.querySelector('span > a[target="_blank"][rel="noopener"] > span.relative');
  });
  sourceSpans.forEach((span) => span.remove());

  // Remove source containers with Sources button or favicon images
  const sourceContainers = Array.from(element.querySelectorAll('div')).filter((div) => {
    const hasSourcesButton = Array.from(div.querySelectorAll('button')).some((btn) =>
      btn.textContent?.includes('Sources')
    );
    const hasFaviconImages = Array.from(div.querySelectorAll('img')).some((img) =>
      img.src?.includes('google.com/s2/favicons')
    );
    return hasSourcesButton || hasFaviconImages;
  });
  sourceContainers.forEach((container) => container.remove());

  // Remove favicon images
  element.querySelectorAll('img[src*="google.com/s2/favicons"]').forEach((img) => img.remove());
}

/**
 * Retry an async operation with true exponential backoff and jitter
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Configuration options
 * @param {number} options.maxRetries - Maximum retry attempts (default 3)
 * @param {number} options.baseDelayMs - Base delay in ms (default 1000)
 * @param {number} options.maxDelayMs - Maximum delay cap in ms (default 30000)
 * @param {number} options.backoffFactor - Multiplier for each retry (default 2)
 * @param {number} options.jitterFactor - Random jitter factor 0-1 (default 0.25)
 * @param {Function} options.onRetry - Callback on each retry (attempt, error, delay)
 * @returns {Promise<any>} Result of fn or null on all failures
 */
async function retryWithBackoff(fn, options = {}) {
  // Support legacy signature: retryWithBackoff(fn, maxRetries, baseDelay, delayIncrement)
  if (typeof options === 'number') {
    const maxRetries = options;
    const baseDelay = arguments[2] || 1500;
    const delayIncrement = arguments[3] || 500;
    // Convert legacy linear to exponential-ish behavior
    options = {
      maxRetries,
      baseDelayMs: baseDelay,
      backoffFactor: 1 + (delayIncrement / baseDelay),
    };
  }

  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    backoffFactor = 2,
    jitterFactor = 0.25,
    onRetry = null,
  } = options;

  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await fn();
      if (result !== null && result !== undefined) {
        return result;
      }
      // If result is null/undefined, treat as soft failure
      lastError = new Error('Function returned null/undefined');
    } catch (err) {
      lastError = err;
      console.warn(`[retryWithBackoff] Attempt ${attempt + 1}/${maxRetries} failed:`, err.message || err);
    }

    // Don't delay after the last attempt
    if (attempt < maxRetries - 1) {
      // True exponential backoff: baseDelay * (factor ^ attempt)
      let delay = baseDelayMs * Math.pow(backoffFactor, attempt);

      // Add jitter: ±jitterFactor of the delay
      const jitter = delay * jitterFactor * (Math.random() * 2 - 1);
      delay = Math.round(delay + jitter);

      // Cap at maxDelay
      delay = Math.min(delay, maxDelayMs);

      if (onRetry) {
        onRetry(attempt + 1, lastError, delay);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  console.warn(`[retryWithBackoff] All ${maxRetries} attempts failed. Last error:`, lastError?.message);
  return null;
}

/**
 * Scroll through entire conversation to ensure all messages are loaded
 * Handles lazy-loading by scrolling from top to bottom in increments
 * @param {Object} options - Configuration options
 * @param {string} options.containerSelector - CSS selector for scroll container
 * @param {string} options.messageSelector - CSS selector for messages (to count)
 * @param {number} options.scrollDelay - Delay between scroll steps in ms (default 200)
 * @param {number} options.maxScrollTime - Maximum time to spend scrolling in ms (default 10000)
 * @returns {Promise<{messageCount: number, scrolled: boolean}>}
 */
async function scrollToLoadAllMessages(options = {}) {
  const {
    containerSelector = 'main, [role="main"], .conversation, [class*="conversation"]',
    messageSelector = '[data-message-author-role], [class*="message"], [class*="turn"]',
    scrollDelay = 200,
    maxScrollTime = 10000,
  } = options;

  // Find the scrollable container
  const container = document.querySelector(containerSelector);
  if (!container) {
    console.warn('[scrollToLoadAllMessages] No container found');
    return { messageCount: 0, scrolled: false };
  }

  // Find the actual scrollable element (might be the container or a parent)
  let scrollable = container;
  if (container.scrollHeight <= container.clientHeight) {
    // Try parent elements
    let parent = container.parentElement;
    while (parent && parent.scrollHeight <= parent.clientHeight) {
      parent = parent.parentElement;
    }
    if (parent) scrollable = parent;
  }

  const startTime = Date.now();
  const initialScroll = scrollable.scrollTop;
  let lastMessageCount = 0;
  let stableCount = 0;

  // Scroll to top first
  scrollable.scrollTo({ top: 0, behavior: 'instant' });
  await new Promise(r => setTimeout(r, scrollDelay));

  // Scroll down in increments to trigger lazy loading
  const scrollStep = scrollable.clientHeight * 0.8;

  while (Date.now() - startTime < maxScrollTime) {
    const currentScroll = scrollable.scrollTop;
    const maxScroll = scrollable.scrollHeight - scrollable.clientHeight;

    // Check if we've reached the bottom
    if (currentScroll >= maxScroll - 10) {
      break;
    }

    // Scroll down one step
    scrollable.scrollBy({ top: scrollStep, behavior: 'instant' });
    await new Promise(r => setTimeout(r, scrollDelay));

    // Count messages to detect when loading is complete
    const messageCount = document.querySelectorAll(messageSelector).length;

    if (messageCount === lastMessageCount) {
      stableCount++;
      // If count is stable for 3 iterations at the same scroll position, we're done
      if (stableCount >= 3) {
        break;
      }
    } else {
      stableCount = 0;
      lastMessageCount = messageCount;
    }
  }

  // Scroll back to bottom (where user likely was)
  scrollable.scrollTo({ top: scrollable.scrollHeight, behavior: 'instant' });
  await new Promise(r => setTimeout(r, 100));

  const finalMessageCount = document.querySelectorAll(messageSelector).length;

  console.log(`[scrollToLoadAllMessages] Found ${finalMessageCount} messages after scrolling`);

  return {
    messageCount: finalMessageCount,
    scrolled: true,
  };
}

/**
 * Quick check if conversation needs scrolling to load more
 * @param {string} containerSelector - CSS selector for container
 * @returns {boolean} True if scrolling might reveal more content
 */
function needsScrollToLoad(containerSelector = 'main, [role="main"]') {
  const container = document.querySelector(containerSelector);
  if (!container) return false;

  // If container is scrollable and not at top, there might be more content
  return container.scrollHeight > container.clientHeight * 1.5;
}

/**
 * Detect attachment types from messages and artifacts
 * Returns an array of detected types: 'code', 'doc', 'html', 'image', 'data'
 * @param {Array} messages - Array of message objects with text content
 * @param {Array} artifacts - Array of artifact objects (optional)
 * @returns {string[]} Array of unique attachment type strings
 */
function detectAttachmentTypes(messages = [], artifacts = []) {
  const types = new Set();

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
 * @returns {string} Icon character or emoji
 */
function getAttachmentIcon(type) {
  const icons = {
    code: '{ }',
    doc: '📄',
    html: '🌐',
    image: '🖼',
    data: '📊',
  };
  return icons[type] || '📎';
}

// Export for use in content scripts (if module system not available, these are global)
if (typeof window !== 'undefined') {
  window.threadHubUtils = {
    scrollIntoViewAndWait,
    extractFormattedText,
    cleanupCodeBlocks,
    copyViaClipboard,
    waitForElement,
    removeSourceCitations,
    retryWithBackoff,
    scrollToLoadAllMessages,
    needsScrollToLoad,
    detectAttachmentTypes,
    getAttachmentIcon,
  };
}
