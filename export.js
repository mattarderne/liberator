/**
 * AI Thread Hub - Export functionality
 * Exports threads to markdown format
 */

/**
 * Export a single thread to markdown
 * @param {Object} thread - Thread record with messages
 * @param {Array} messages - Array of message objects
 * @returns {string} Markdown formatted thread
 */
function exportThreadToMarkdown(thread, messages) {
  const lines = [];

  // Header
  lines.push(`# ${thread.title || 'Untitled Thread'}`);
  lines.push('');

  // Metadata
  lines.push('## Metadata');
  lines.push('');
  lines.push(`- **Provider:** ${getProviderName(thread.provider)}`);
  lines.push(`- **Status:** ${thread.status || 'unknown'}`);
  if (thread.category) lines.push(`- **Category:** ${thread.category}`);
  if (thread.priority) lines.push(`- **Priority:** ${thread.priority}`);
  if (thread.last_synced_at) lines.push(`- **Last Synced:** ${new Date(thread.last_synced_at).toLocaleString()}`);
  if (thread.message_count) lines.push(`- **Messages:** ${thread.message_count}`);

  // Tags
  const tags = Array.isArray(thread.tags) ? thread.tags : [];
  if (tags.length > 0) {
    lines.push(`- **Tags:** ${tags.join(', ')}`);
  }

  // Sensitivity flags
  const flags = [];
  if (thread.contains_pii) flags.push('PII');
  if (thread.contains_security_or_secrets) flags.push('Security/Secrets');
  if (thread.contains_customer_sensitive) flags.push('Customer Sensitive');
  if (thread.contains_legal_sensitive) flags.push('Legal Sensitive');
  if (flags.length > 0) {
    lines.push(`- **Sensitivity Flags:** ${flags.join(', ')}`);
  }

  lines.push('');

  // Summary
  const summary = thread.ai_summary || thread.provider_summary;
  if (summary) {
    lines.push('## Summary');
    lines.push('');
    lines.push(summary);
    lines.push('');
  }

  // AI Analysis
  if (thread.progress_stage || thread.outcome_prediction || thread.suggested_next_step) {
    lines.push('## Analysis');
    lines.push('');
    if (thread.progress_stage) lines.push(`- **Progress Stage:** ${thread.progress_stage}`);
    if (thread.outcome_prediction) lines.push(`- **Outcome Prediction:** ${thread.outcome_prediction}`);
    if (thread.suggested_next_step) lines.push(`- **Suggested Next Step:** ${thread.suggested_next_step}`);
    lines.push('');
  }

  // Messages
  lines.push('## Conversation');
  lines.push('');

  if (Array.isArray(messages) && messages.length > 0) {
    messages.forEach((msg, index) => {
      const role = msg.role === 'user' ? 'User' : getProviderName(thread.provider);
      lines.push(`### ${role}`);
      lines.push('');
      lines.push(msg.text || '');
      lines.push('');
    });
  } else {
    lines.push('*No messages available*');
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*Exported from AI Thread Hub on ${new Date().toLocaleString()}*`);

  return lines.join('\n');
}

/**
 * Export multiple threads to markdown (combined or individual files)
 * @param {Array} threads - Array of thread objects with messages
 * @returns {string} Combined markdown document
 */
function exportThreadsToMarkdown(threads) {
  const lines = [];

  lines.push('# AI Thread Hub Export');
  lines.push('');
  lines.push(`**Exported:** ${new Date().toLocaleString()}`);
  lines.push(`**Total Threads:** ${threads.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  threads.forEach((item, index) => {
    const { thread, messages } = item;
    lines.push(`# ${index + 1}. ${thread.title || 'Untitled Thread'}`);
    lines.push('');

    // Brief metadata
    lines.push(`**Provider:** ${getProviderName(thread.provider)} | **Status:** ${thread.status || 'unknown'} | **Messages:** ${thread.message_count || messages?.length || 0}`);
    lines.push('');

    const summary = thread.ai_summary || thread.provider_summary;
    if (summary) {
      lines.push(`> ${summary}`);
      lines.push('');
    }

    // Messages
    if (Array.isArray(messages) && messages.length > 0) {
      messages.forEach((msg) => {
        const role = msg.role === 'user' ? '**User:**' : `**${getProviderName(thread.provider)}:**`;
        lines.push(role);
        lines.push('');
        lines.push(msg.text || '');
        lines.push('');
      });
    }

    lines.push('---');
    lines.push('');
  });

  lines.push(`*Exported from AI Thread Hub*`);

  return lines.join('\n');
}

/**
 * Generate filename for export
 * @param {Object} thread - Thread object
 * @returns {string} Safe filename
 */
function generateExportFilename(thread) {
  const title = (thread.title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

  const date = new Date().toISOString().split('T')[0];
  return `${thread.provider}-${title}-${date}.md`;
}

/**
 * Download content as a file
 * @param {string} content - File content
 * @param {string} filename - Filename with extension
 */
function downloadAsFile(content, filename) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Get display name for provider
 * @param {string} provider - Provider key
 * @returns {string} Display name
 */
function getProviderName(provider) {
  const names = {
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    gemini: 'Gemini',
    grok: 'Grok',
  };
  return names[provider] || 'Assistant';
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    exportThreadToMarkdown,
    exportThreadsToMarkdown,
    generateExportFilename,
    downloadAsFile,
  };
}
