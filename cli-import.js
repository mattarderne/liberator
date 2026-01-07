/**
 * Claude Code Import Module
 *
 * Imports AI coding conversations from Claude Code's local storage.
 *
 * Claude Code stores sessions in:
 * - ~/.claude/projects/{project-path-hash}/*.jsonl - Full conversation sessions
 * - ~/.claude/history.jsonl - Command history (prompts only)
 *
 * JSONL format per line:
 * - {type: "summary", summary: "...", leafUuid: "..."}
 * - {type: "user", message: {role: "user", content: "..."}, uuid: "...", timestamp: "...", cwd: "...", sessionId: "..."}
 * - {type: "assistant", message: {role: "assistant", content: [...]}, uuid: "...", timestamp: "..."}
 * - {type: "file-history-snapshot", ...}
 * - {type: "queue-operation", ...}
 */

/**
 * Parse a Claude Code JSONL session file
 * @param {string} content - Raw JSONL content
 * @param {string} filePath - Path to the file (used for ID and metadata)
 * @returns {Object|null} Parsed thread object or null if invalid
 */
function parseClaudeCodeSession(content, filePath) {
  if (!content || typeof content !== 'string') return null;

  const lines = content.trim().split('\n').filter(line => line.trim());
  if (lines.length === 0) return null;

  const messages = [];
  let title = null;
  let sessionId = null;
  let projectPath = null;
  let gitBranch = null;
  let createdAt = null;
  let lastTimestamp = null;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // Extract summary as title
      if (entry.type === 'summary' && entry.summary && !title) {
        title = entry.summary;
      }

      // Extract session metadata from first user/assistant message
      if ((entry.type === 'user' || entry.type === 'assistant') && entry.sessionId) {
        if (!sessionId) sessionId = entry.sessionId;
        if (!projectPath && entry.cwd) projectPath = entry.cwd;
        if (!gitBranch && entry.gitBranch) gitBranch = entry.gitBranch;
      }

      // Track timestamps
      if (entry.timestamp) {
        const ts = entry.timestamp;
        if (!createdAt || ts < createdAt) createdAt = ts;
        if (!lastTimestamp || ts > lastTimestamp) lastTimestamp = ts;
      }

      // Parse user messages
      if (entry.type === 'user' && entry.message) {
        const content = extractMessageContent(entry.message);
        if (content && !content.startsWith('[Request interrupted')) {
          messages.push({
            role: 'user',
            text: content,
            timestamp: entry.timestamp,
            uuid: entry.uuid,
          });
        }
      }

      // Parse assistant messages
      if (entry.type === 'assistant' && entry.message) {
        const content = extractMessageContent(entry.message);
        if (content) {
          messages.push({
            role: 'assistant',
            text: content,
            timestamp: entry.timestamp,
            uuid: entry.uuid,
            model: entry.message?.model,
          });
        }
      }
    } catch (e) {
      // Skip malformed lines
      continue;
    }
  }

  // Need at least one message
  if (messages.length === 0) return null;

  // Generate thread ID from session ID or file path
  const threadId = sessionId || generateThreadIdFromPath(filePath);

  // Extract project name from path
  const projectName = extractProjectName(filePath, projectPath);

  // Use first user message as title fallback
  if (!title && messages.length > 0) {
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      title = firstUserMsg.text.slice(0, 100) + (firstUserMsg.text.length > 100 ? '...' : '');
    }
  }

  return {
    provider_thread_id: threadId,
    provider: 'claude',
    source: 'cli',
    cli_tool: 'claude-code',
    title: title || 'Claude Code Session',
    messages: messages.map(m => ({ role: m.role, text: m.text })),
    created_at: createdAt,
    updated_at: lastTimestamp,
    github_repo: gitBranch ? `${projectName} (${gitBranch})` : null,
    metadata: {
      source_file: filePath,
      cli_tool: 'claude-code',
      session_id: sessionId,
      project_path: projectPath,
      project_name: projectName,
      git_branch: gitBranch,
      message_count: messages.length,
    },
  };
}

/**
 * Extract text content from a Claude Code message object
 * @param {Object} message - Message object with role and content
 * @returns {string|null} Extracted text content
 */
function extractMessageContent(message) {
  if (!message) return null;

  // Simple string content
  if (typeof message.content === 'string') {
    return message.content;
  }

  // Array content (assistant messages with thinking, text, tool_use blocks)
  if (Array.isArray(message.content)) {
    const textParts = [];

    for (const block of message.content) {
      if (block.type === 'text' && block.text) {
        textParts.push(block.text);
      }
      // Include tool use summaries
      if (block.type === 'tool_use' && block.name) {
        textParts.push(`[Tool: ${block.name}]`);
      }
      // Include tool results (truncated)
      if (block.type === 'tool_result' && block.content) {
        const resultText = typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content);
        textParts.push(`[Result: ${resultText.slice(0, 200)}...]`);
      }
    }

    return textParts.join('\n').trim() || null;
  }

  return null;
}

/**
 * Generate a thread ID from file path
 * @param {string} filePath - Path to session file
 * @returns {string} Thread ID
 */
function generateThreadIdFromPath(filePath) {
  // Extract filename without extension
  const match = filePath.match(/([^/\\]+)\.jsonl$/i);
  if (match) {
    return `claude-code-${match[1]}`;
  }
  // Fallback to hash of path
  return `claude-code-${hashString(filePath)}`;
}

/**
 * Extract project name from file path or cwd
 * @param {string} filePath - Path to session file
 * @param {string} cwd - Working directory from session
 * @returns {string} Project name
 */
function extractProjectName(filePath, cwd) {
  // Try to extract from cwd
  if (cwd) {
    const parts = cwd.split('/').filter(p => p);
    return parts[parts.length - 1] || 'unknown';
  }

  // Try to extract from file path (project hash folder)
  const match = filePath.match(/projects\/([^/]+)\//);
  if (match) {
    // Convert hash path back to readable name
    // e.g., "-Users-username-my-project" -> "my-project"
    const hashPath = match[1];
    const parts = hashPath.split('-').filter(p => p);
    return parts[parts.length - 1] || hashPath;
  }

  return 'unknown';
}

/**
 * Simple string hash function
 * @param {string} str - String to hash
 * @returns {string} Hash string
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Filter files to find Claude Code session files
 * @param {FileList|Array} files - Files from directory input
 * @returns {Array<File>} Array of JSONL session files
 */
function filterClaudeCodeFiles(files) {
  const sessionFiles = [];

  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    // Match .claude/projects/**/*.jsonl
    if (path.includes('.claude/') && path.endsWith('.jsonl')) {
      // Skip history.jsonl (just prompts, no responses)
      if (!path.endsWith('history.jsonl')) {
        sessionFiles.push(file);
      }
    }
  }

  return sessionFiles;
}

/**
 * Read file content as text
 * @param {File} file - File object
 * @returns {Promise<string>} File content
 */
function readFileContent(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Import Claude Code session files
 * @param {FileList|Array} files - Files from directory picker
 * @returns {Promise<{threads: Array, errors: Array}>} Import results
 */
async function importClaudeCodeSessions(files) {
  const sessionFiles = filterClaudeCodeFiles(files);
  const threads = [];
  const errors = [];

  for (const file of sessionFiles) {
    try {
      const content = await readFileContent(file);
      const path = file.webkitRelativePath || file.name;
      const thread = parseClaudeCodeSession(content, path);

      if (thread && thread.messages.length > 0) {
        threads.push(thread);
      }
    } catch (err) {
      errors.push({
        file: file.webkitRelativePath || file.name,
        error: err.message,
      });
    }
  }

  // Sort by created_at descending
  threads.sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
    const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
    return dateB - dateA;
  });

  return { threads, errors };
}

/**
 * Get import statistics
 * @param {Array} threads - Array of parsed threads
 * @returns {Object} Statistics
 */
function getImportStats(threads) {
  const stats = {
    total: threads.length,
    totalMessages: 0,
    byProject: {},
    dateRange: { earliest: null, latest: null },
  };

  for (const thread of threads) {
    stats.totalMessages += thread.messages?.length || 0;

    // Group by project
    const project = thread.metadata?.project_name || 'unknown';
    stats.byProject[project] = (stats.byProject[project] || 0) + 1;

    // Track date range
    if (thread.created_at) {
      const date = new Date(thread.created_at);
      if (!stats.dateRange.earliest || date < new Date(stats.dateRange.earliest)) {
        stats.dateRange.earliest = thread.created_at;
      }
      if (!stats.dateRange.latest || date > new Date(stats.dateRange.latest)) {
        stats.dateRange.latest = thread.created_at;
      }
    }
  }

  return stats;
}

/**
 * Parse sessions from raw file data (for native messaging)
 * @param {Array<{path: string, content: string}>} fileData - Array of file data
 * @returns {{threads: Array, errors: Array}} Parsed results
 */
function parseSessionsFromData(fileData) {
  const threads = [];
  const errors = [];

  for (const { path, content } of fileData) {
    try {
      const thread = parseClaudeCodeSession(content, path);
      if (thread && thread.messages.length > 0) {
        threads.push(thread);
      }
    } catch (err) {
      errors.push({ file: path, error: err.message });
    }
  }

  return { threads, errors };
}

export {
  parseClaudeCodeSession,
  extractMessageContent,
  filterClaudeCodeFiles,
  readFileContent,
  importClaudeCodeSessions,
  getImportStats,
  parseSessionsFromData,
  generateThreadIdFromPath,
};
