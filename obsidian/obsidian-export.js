/**
 * Obsidian Export Module
 *
 * Generates Obsidian-compatible markdown files with YAML frontmatter
 * from AI Thread Hub threads.
 */

/**
 * Generate YAML frontmatter for a thread
 * @param {Object} thread - Thread object
 * @param {Date} syncedAt - When this was synced
 * @returns {string} YAML frontmatter block
 */
function generateFrontmatter(thread, syncedAt = new Date()) {
  const frontmatter = {
    title: thread.title || 'Untitled Thread',
    provider: thread.provider,
    provider_thread_id: thread.provider_thread_id,
    status: thread.status || 'unknown',
    category: thread.category || 'other',
    priority: thread.priority || 'medium',
    tags: thread.tags || [],
    created_at: thread.created_at,
    synced_at: syncedAt.toISOString(),
    source_url: thread.url,
    message_count: thread.message_count || 0,
    ai_summary: thread.ai_summary || null,
    contains_pii: thread.contains_pii || false,
    contains_secrets: thread.contains_security_or_secrets || false,
    thread_hub_id: thread.id,
  };

  // Add optional fields if present
  if (thread.github_repo) {
    frontmatter.github_repo = thread.github_repo;
  }
  if (thread.organization) {
    frontmatter.organization = thread.organization;
  }
  if (thread.outcome_prediction) {
    frontmatter.outcome_prediction = thread.outcome_prediction;
  }
  if (thread.progress_stage) {
    frontmatter.progress_stage = thread.progress_stage;
  }
  if (thread.suggested_next_step) {
    frontmatter.suggested_next_step = thread.suggested_next_step;
  }

  // Convert to YAML format
  const lines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${escapeYamlValue(item)}`);
        }
      }
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${escapeYamlValue(value)}`);
    }
  }
  lines.push('---');

  return lines.join('\n');
}

/**
 * Escape a value for YAML
 * @param {string} value
 * @returns {string}
 */
function escapeYamlValue(value) {
  if (typeof value !== 'string') {
    return String(value);
  }
  // Quote strings that contain special characters
  if (value.includes(':') || value.includes('#') || value.includes('\n') ||
      value.includes('"') || value.includes("'") || value.startsWith(' ') ||
      value.startsWith('-') || value.startsWith('[') || value.startsWith('{')) {
    // Use double quotes and escape internal quotes
    return `"${value.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  }
  return value;
}

/**
 * Generate markdown content for a thread
 * @param {Object} thread - Thread object
 * @param {Object} options - Export options
 * @param {string} options.includeMessages - 'none', 'summary-only', 'full'
 * @param {Array} options.messages - Message array (if includeMessages !== 'none')
 * @returns {string} Markdown content (without frontmatter)
 */
function generateMarkdownBody(thread, options = {}) {
  const { includeMessages = 'summary-only', messages = [] } = options;
  const lines = [];

  // Title
  lines.push(`# ${thread.title || 'Untitled Thread'}`);
  lines.push('');

  // Summary section
  if (thread.ai_summary || thread.provider_summary) {
    lines.push('## Summary');
    lines.push(thread.ai_summary || thread.provider_summary);
    lines.push('');
  }

  // Analysis section (if we have AI inferences)
  if (thread.progress_stage || thread.outcome_prediction || thread.suggested_next_step) {
    lines.push('## Analysis');
    if (thread.progress_stage) {
      lines.push(`- **Progress Stage:** ${thread.progress_stage}`);
    }
    if (thread.outcome_prediction) {
      lines.push(`- **Outcome Prediction:** ${thread.outcome_prediction}`);
    }
    if (thread.suggested_next_step) {
      lines.push(`- **Suggested Next Step:** ${thread.suggested_next_step}`);
    }
    lines.push('');
  }

  // Sensitivity warnings
  const sensitivities = [];
  if (thread.contains_pii) sensitivities.push('PII');
  if (thread.contains_legal_sensitive) sensitivities.push('Legal');
  if (thread.contains_customer_sensitive) sensitivities.push('Customer Data');
  if (thread.contains_hr_sensitive) sensitivities.push('HR');
  if (thread.contains_security_or_secrets) sensitivities.push('Secrets/Credentials');

  if (sensitivities.length > 0) {
    lines.push('## Sensitivity');
    lines.push(`> [!warning] Contains: ${sensitivities.join(', ')}`);
    lines.push('');
  }

  // Quick stats
  lines.push('## Quick Stats');
  lines.push(`- **Provider:** ${thread.provider}`);
  lines.push(`- **Messages:** ${thread.message_count || messages.length || 0}`);
  lines.push(`- **Created:** ${formatDate(thread.created_at)}`);
  lines.push(`- **Status:** ${thread.status || 'unknown'}`);
  if (thread.tags && thread.tags.length > 0) {
    lines.push(`- **Tags:** ${thread.tags.join(', ')}`);
  }
  lines.push('');

  // Messages section
  if (includeMessages === 'full' && messages && messages.length > 0) {
    lines.push('## Conversation');
    lines.push('');

    for (const msg of messages) {
      const role = msg.role === 'user' ? 'User' :
                   msg.role === 'assistant' ? getProviderName(thread.provider) :
                   msg.role.charAt(0).toUpperCase() + msg.role.slice(1);

      lines.push(`### ${role}`);
      lines.push('');
      lines.push(msg.text);
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push(`*Synced from [AI Thread Hub](${thread.url || '#'})*`);

  return lines.join('\n');
}

/**
 * Generate complete markdown file content
 * @param {Object} thread - Thread object
 * @param {Object} options - Export options
 * @returns {string} Complete markdown with frontmatter
 */
function generateObsidianMarkdown(thread, options = {}) {
  const frontmatter = generateFrontmatter(thread, options.syncedAt || new Date());
  const body = generateMarkdownBody(thread, options);
  return `${frontmatter}\n\n${body}`;
}

/**
 * Generate a safe filename from thread title
 * @param {Object} thread - Thread object
 * @returns {string} Safe filename (without extension)
 */
function generateFilename(thread) {
  // Start with title
  let name = thread.title || 'untitled';

  // Sanitize: remove/replace problematic characters
  name = name
    .toLowerCase()
    .replace(/[<>:"/\\|?*]/g, '') // Remove Windows-forbidden chars
    .replace(/\s+/g, '-')          // Replace spaces with hyphens
    .replace(/[^\w\-]/g, '')       // Remove non-word chars except hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .replace(/^-|-$/g, '')         // Trim leading/trailing hyphens
    .slice(0, 50);                 // Limit length

  // Add short ID for uniqueness
  const shortId = thread.id.replace('thread-', '').slice(0, 8);

  return `${name}-${shortId}`;
}

/**
 * Generate the full path for a thread's markdown file
 * @param {Object} thread - Thread object
 * @param {Object} config - Sync configuration
 * @returns {string} Full path within vault
 */
function generateFilePath(thread, config = {}) {
  const {
    targetFolder = 'AI Threads',
    folderStructure = 'by-provider',
  } = config;

  const filename = generateFilename(thread) + '.md';

  let subFolder = '';
  switch (folderStructure) {
    case 'by-provider':
      subFolder = thread.provider;
      break;
    case 'by-category':
      subFolder = thread.category || 'other';
      break;
    case 'by-date':
      const date = new Date(thread.created_at);
      subFolder = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
      break;
    case 'flat':
    default:
      subFolder = '';
  }

  const parts = [targetFolder, subFolder, filename].filter(Boolean);
  return parts.join('/');
}

/**
 * Format a date for display
 * @param {string} isoDate
 * @returns {string}
 */
function formatDate(isoDate) {
  if (!isoDate) return 'Unknown';
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

/**
 * Get display name for provider
 * @param {string} provider
 * @returns {string}
 */
function getProviderName(provider) {
  const names = {
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    gemini: 'Gemini',
    grok: 'Grok',
    copilot: 'Copilot',
  };
  return names[provider] || provider;
}

/**
 * Compute a content hash for change detection
 * @param {Object} thread - Thread object
 * @returns {string} Hash string
 */
async function computeContentHash(thread) {
  // Create a string from the key fields that matter for sync
  const content = JSON.stringify({
    title: thread.title,
    ai_summary: thread.ai_summary,
    status: thread.status,
    category: thread.category,
    tags: thread.tags,
    message_count: thread.message_count,
    // Don't include searchable_content as it's too large
  });

  // Use SubtleCrypto if available, otherwise simple hash
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback: simple string hash
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

// Export for use in extension
if (typeof window !== 'undefined') {
  window.ObsidianExport = {
    generateFrontmatter,
    generateMarkdownBody,
    generateObsidianMarkdown,
    generateFilename,
    generateFilePath,
    computeContentHash,
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    generateFrontmatter,
    generateMarkdownBody,
    generateObsidianMarkdown,
    generateFilename,
    generateFilePath,
    computeContentHash,
  };
}
