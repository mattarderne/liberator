/**
 * Liberator - Search View
 * Clean, Grok-inspired search interface with hover preview
 */

// State
let allThreads = [];
let filteredThreads = [];
let focusedIndex = -1;
let selectedProvider = '';
let searchQuery = '';
let previewedThread = null;
let previewCache = new Map();
let hoverTimeout = null;

// Provider icons
const PROVIDER_ICONS = {
  chatgpt: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>',
  claude: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>',
  gemini: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
  grok: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  copilot: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>',
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Search] Initializing...');
  await loadThreads();
  setupEventListeners();
  setupKeyboardShortcuts();
});

async function loadThreads() {
  try {
    console.log('[Search] Sending LIST_THREADS message...');
    const response = await chrome.runtime.sendMessage({
      type: 'LIST_THREADS',
      filters: selectedProvider ? { provider: selectedProvider } : {},
    });

    console.log('[Search] Response:', response);

    if (response?.error) {
      throw new Error(response.error);
    }

    allThreads = response?.threads || [];
    console.log('[Search] Loaded', allThreads.length, 'threads');
    applyFiltersAndRender();
  } catch (err) {
    console.error('[Search] Failed to load threads:', err);
    document.getElementById('chat-list-pane').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Failed to load</div>
        <div class="empty-state-subtitle">${escapeHtml(err.message || 'Unknown error')}</div>
      </div>
    `;
  }
}

function applyFiltersAndRender() {
  let threads = [...allThreads];

  // Apply provider filter
  if (selectedProvider) {
    threads = threads.filter(t => t.provider === selectedProvider);
  }

  // Apply search filter
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    threads = threads.filter(t =>
      (t.title || '').toLowerCase().includes(query) ||
      (t.summary || '').toLowerCase().includes(query) ||
      (t.tags || []).some(tag => tag.toLowerCase().includes(query))
    );
  }

  // Sort by last synced
  threads.sort((a, b) => new Date(b.last_synced_at) - new Date(a.last_synced_at));

  filteredThreads = threads;
  document.getElementById('total-count').textContent = threads.length;
  renderThreads();
}

function renderThreads() {
  const container = document.getElementById('chat-list-pane');

  if (filteredThreads.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.3-4.3"></path>
          </svg>
        </div>
        <div class="empty-state-title">${searchQuery ? 'No matching conversations' : 'No conversations yet'}</div>
        <div class="empty-state-subtitle">${searchQuery ? 'Try a different search term' : 'Visit ChatGPT, Claude, Gemini, Grok, or Copilot to sync your conversations'}</div>
      </div>
    `;
    return;
  }

  // Group by time
  const groups = groupByTime(filteredThreads);

  let html = '';
  let globalIndex = 0;

  for (const [label, threads] of Object.entries(groups)) {
    if (threads.length === 0) continue;

    html += `
      <div class="time-group">
        <div class="time-group-header">${label}</div>
        <div class="chat-list">
          ${threads.map((thread) => {
            const item = renderChatItem(thread, globalIndex);
            globalIndex++;
            return item;
          }).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  // Restore focus if needed
  if (focusedIndex >= 0 && focusedIndex < filteredThreads.length) {
    updateFocus(focusedIndex);
    showPreview(filteredThreads[focusedIndex]);
  }
}

function groupByTime(threads) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups = {
    'Today': [],
    'Yesterday': [],
    'This Week': [],
    'Earlier': [],
  };

  for (const thread of threads) {
    const date = new Date(thread.last_synced_at);
    if (date >= today) {
      groups['Today'].push(thread);
    } else if (date >= yesterday) {
      groups['Yesterday'].push(thread);
    } else if (date >= weekAgo) {
      groups['This Week'].push(thread);
    } else {
      groups['Earlier'].push(thread);
    }
  }

  return groups;
}

function renderChatItem(thread, globalIndex) {
  const provider = thread.provider || 'chatgpt';
  const icon = PROVIDER_ICONS[provider] || PROVIDER_ICONS.chatgpt;
  const time = formatTime(thread.last_synced_at);
  const tags = (thread.tags || []).slice(0, 2);
  const isFocused = globalIndex === focusedIndex;
  const attachmentBadges = getAttachmentBadges(thread.attachment_types);

  return `
    <div class="chat-item ${isFocused ? 'focused' : ''}"
         data-id="${thread.id}"
         data-index="${globalIndex}"
         data-provider="${provider}"
         data-provider-thread-id="${thread.provider_thread_id || ''}"
         data-url="${escapeHtml(thread.url || '')}">
      <div class="chat-provider ${provider}">${icon}</div>
      <div class="chat-content">
        <div class="chat-title">${escapeHtml(thread.title || 'Untitled')}</div>
        <div class="chat-meta">
          <span>${thread.message_count || 0} messages</span>
          ${attachmentBadges ? `<span class="chat-attachments">${attachmentBadges}</span>` : ''}
          ${thread.category ? `<span>${escapeHtml(thread.category)}</span>` : ''}
        </div>
      </div>
      ${tags.length ? `
        <div class="chat-tags">
          ${tags.map(tag => `<span class="chat-tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
      ` : ''}
      <span class="chat-time">${time}</span>
    </div>
  `;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============ MESSAGE DEDUPLICATION ============

function deduplicateMessages(messages) {
  if (!messages || messages.length === 0) return [];

  const seen = new Map();
  return messages.filter(msg => {
    // Use index as primary key, fall back to role+content hash
    const key = msg.index !== undefined
      ? `idx:${msg.index}`
      : `${msg.role}:${(msg.text || '').slice(0, 100)}`;
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
}

// ============ MARKDOWN RENDERING ============

function renderMarkdown(text) {
  if (!text) return '';

  let html = escapeHtml(text);

  // Code blocks (```...```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="md-code-block"><code>${code.trim()}</code></pre>`;
  });

  // Inline code (`...`)
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // Bold (**...**)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic (*...*)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links [text](url) - but don't make them clickable in preview
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="md-link">$1</span>');

  // Headers (# ...)
  html = html.replace(/^### (.+)$/gm, '<strong class="md-h3">$1</strong>');
  html = html.replace(/^## (.+)$/gm, '<strong class="md-h2">$1</strong>');
  html = html.replace(/^# (.+)$/gm, '<strong class="md-h1">$1</strong>');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

// ============ ATTACHMENT ICONS ============

const ATTACHMENT_ICONS = {
  code: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  image: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  doc: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  data: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
};

function getAttachmentBadges(types) {
  if (!types || types.length === 0) return '';

  return types.map(type => {
    const icon = ATTACHMENT_ICONS[type] || ATTACHMENT_ICONS.doc;
    return `<span class="attachment-badge" title="${type}">${icon}</span>`;
  }).join('');
}

// Preview functions
async function showPreview(thread) {
  if (!thread) return;

  previewedThread = thread;
  const previewPane = document.getElementById('preview-pane');
  const provider = thread.provider || 'chatgpt';
  const icon = PROVIDER_ICONS[provider] || PROVIDER_ICONS.chatgpt;

  // Show header immediately with loading state for messages
  previewPane.innerHTML = `
    <div class="preview-header">
      <div class="chat-provider ${provider}" style="width: 36px; height: 36px; border-radius: 8px;">${icon}</div>
      <div class="preview-header-content">
        <div class="preview-title">${escapeHtml(thread.title || 'Untitled')}</div>
        <div class="preview-meta">
          <span>${thread.message_count || 0} messages</span>
          <span>${provider}</span>
          <span>${formatTime(thread.last_synced_at)}</span>
        </div>
      </div>
      <div class="action-panel">
        <button class="action-btn" id="copy-link-btn" title="Copy link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
        </button>
        <button class="action-btn primary" id="open-chat-btn">
          Open
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </button>
      </div>
    </div>
    <div class="preview-messages">
      <div class="preview-loading">Loading messages...</div>
    </div>
  `;

  // Setup action button handlers
  document.getElementById('copy-link-btn').onclick = () => copyThreadLink(thread);
  document.getElementById('open-chat-btn').onclick = () => openThreadDirect(thread);

  // Load messages
  await loadPreviewMessages(thread);
}

async function loadPreviewMessages(thread) {
  const messagesContainer = document.querySelector('.preview-messages');
  if (!messagesContainer) return;

  // Check cache
  if (previewCache.has(thread.id)) {
    renderMessages(previewCache.get(thread.id));
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_THREAD',
      threadId: thread.id,
    });

    if (response?.error) {
      throw new Error(response.error);
    }

    // Use response.messages (full list from messages store), not response.thread.messages (embedded preview)
    const rawMessages = response?.messages || [];
    // Deduplicate and sort by index
    const messages = deduplicateMessages(rawMessages).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    previewCache.set(thread.id, messages);
    renderMessages(messages);
  } catch (err) {
    console.error('[Search] Failed to load messages:', err);
    messagesContainer.innerHTML = `
      <div class="preview-loading">Failed to load messages</div>
    `;
  }
}

function renderMessages(messages) {
  const messagesContainer = document.querySelector('.preview-messages');
  if (!messagesContainer) return;

  if (messages.length === 0) {
    messagesContainer.innerHTML = `
      <div class="preview-loading">No messages yet</div>
    `;
    return;
  }

  // Show first few messages with truncation
  const displayMessages = messages.slice(0, 6);

  messagesContainer.innerHTML = displayMessages.map((msg, i) => {
    const isLast = i === displayMessages.length - 1;
    const content = msg.text || msg.content || '';
    const shouldTruncate = content.length > 800 || (isLast && messages.length > 6);
    const displayContent = content.slice(0, 800) + (content.length > 800 ? '...' : '');

    return `
      <div class="message">
        <div class="message-header">
          <span class="message-role ${msg.role}">${msg.role}</span>
        </div>
        <div class="message-content ${shouldTruncate ? 'truncated' : ''}">
          ${renderMarkdown(displayContent)}
        </div>
      </div>
    `;
  }).join('');

  if (messages.length > 6) {
    messagesContainer.innerHTML += `
      <div style="text-align: center; padding: 12px; color: var(--text-muted); font-size: 12px;">
        +${messages.length - 6} more messages
      </div>
    `;
  }
}

function clearPreview() {
  previewedThread = null;
  document.getElementById('preview-pane').innerHTML = `
    <div class="preview-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <span>Select a conversation to preview</span>
    </div>
  `;
}

// Action functions
function copyThreadLink(thread) {
  const url = buildProviderUrlFromThread(thread);
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('copy-link-btn');
    if (btn) {
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      setTimeout(() => {
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
        `;
      }, 1500);
    }
  });
}

function openThreadDirect(thread) {
  const url = buildProviderUrlFromThread(thread);
  window.open(url, '_blank');
}

function buildProviderUrlFromThread(thread) {
  if (thread.url && thread.url.startsWith('http')) {
    return thread.url;
  }

  const provider = thread.provider;
  const providerThreadId = thread.provider_thread_id;

  switch (provider) {
    case 'chatgpt':
      return `https://chatgpt.com/c/${providerThreadId}`;
    case 'claude':
      return `https://claude.ai/chat/${providerThreadId}`;
    case 'gemini':
      return `https://gemini.google.com/app/${providerThreadId}`;
    case 'grok':
      return `https://grok.com/c/${providerThreadId}`;
    case 'copilot':
      return `https://copilot.microsoft.com`;
    default:
      return '#';
  }
}

function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById('search-input');
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchQuery = e.target.value.trim();
      focusedIndex = -1;
      applyFiltersAndRender();
      clearPreview();
    }, 150);
  });

  // Provider filter pills
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedProvider = pill.dataset.provider;
      focusedIndex = -1;
      loadThreads();
      clearPreview();
    });
  });

  // Chat list pane - handle hover and click
  const chatListPane = document.getElementById('chat-list-pane');

  chatListPane.addEventListener('mouseenter', (e) => {
    const item = e.target.closest('.chat-item');
    if (item) {
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        const index = parseInt(item.dataset.index);
        if (filteredThreads[index]) {
          showPreview(filteredThreads[index]);
        }
      }, 100);
    }
  }, true);

  chatListPane.addEventListener('mouseover', (e) => {
    const item = e.target.closest('.chat-item');
    if (item) {
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        const index = parseInt(item.dataset.index);
        if (filteredThreads[index]) {
          showPreview(filteredThreads[index]);
        }
      }, 100);
    }
  });

  chatListPane.addEventListener('click', (e) => {
    const item = e.target.closest('.chat-item');
    if (item) {
      const index = parseInt(item.dataset.index);
      focusedIndex = index;
      updateFocus(focusedIndex);
      if (filteredThreads[index]) {
        showPreview(filteredThreads[index]);
      }
    }
  });

  // Double-click to open
  chatListPane.addEventListener('dblclick', (e) => {
    const item = e.target.closest('.chat-item');
    if (item) {
      const index = parseInt(item.dataset.index);
      if (filteredThreads[index]) {
        openThreadDirect(filteredThreads[index]);
      }
    }
  });

  // Advanced button
  document.getElementById('advanced-btn').addEventListener('click', () => {
    window.location.href = 'view.html';
  });

  // Settings button
  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const searchInput = document.getElementById('search-input');
    const isSearchFocused = document.activeElement === searchInput;

    // Focus search with /
    if (e.key === '/' && !isSearchFocused) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    // Escape to blur search or clear preview
    if (e.key === 'Escape') {
      if (isSearchFocused) {
        searchInput.blur();
      }
      return;
    }

    // Navigate list with arrow keys
    if (e.key === 'ArrowDown' && !isSearchFocused) {
      e.preventDefault();
      if (focusedIndex < filteredThreads.length - 1) {
        focusedIndex++;
        updateFocus(focusedIndex);
        scrollToFocused();
        showPreview(filteredThreads[focusedIndex]);
      }
    }

    if (e.key === 'ArrowUp' && !isSearchFocused) {
      e.preventDefault();
      if (focusedIndex > 0) {
        focusedIndex--;
        updateFocus(focusedIndex);
        scrollToFocused();
        showPreview(filteredThreads[focusedIndex]);
      } else if (focusedIndex === 0) {
        focusedIndex = -1;
        updateFocus(-1);
        searchInput.focus();
        clearPreview();
      }
    }

    // Open thread with Enter
    if (e.key === 'Enter' && !isSearchFocused && focusedIndex >= 0) {
      e.preventDefault();
      if (filteredThreads[focusedIndex]) {
        openThreadDirect(filteredThreads[focusedIndex]);
      }
    }

    // Tab to go to advanced view
    if (e.key === 'Tab' && !e.shiftKey && !isSearchFocused) {
      e.preventDefault();
      window.location.href = 'view.html';
    }

    // ? for shortcuts help
    if (e.key === '?' && !isSearchFocused) {
      e.preventDefault();
      alert('Keyboard Shortcuts:\n\n/ - Focus search\nEsc - Clear focus\n↑/↓ or j/k - Navigate list\nEnter - Open conversation\nTab - Advanced view');
    }

    // j/k for vim-style navigation
    if ((e.key === 'j' || e.key === 'k') && !isSearchFocused) {
      e.preventDefault();
      if (e.key === 'j' && focusedIndex < filteredThreads.length - 1) {
        focusedIndex++;
      } else if (e.key === 'k' && focusedIndex > 0) {
        focusedIndex--;
      }
      updateFocus(focusedIndex);
      scrollToFocused();
      showPreview(filteredThreads[focusedIndex]);
    }

    // c to copy link
    if (e.key === 'c' && !isSearchFocused && previewedThread) {
      e.preventDefault();
      copyThreadLink(previewedThread);
    }
  });

  // Handle arrow keys when search is focused to move to list
  document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && filteredThreads.length > 0) {
      e.preventDefault();
      e.target.blur();
      focusedIndex = 0;
      updateFocus(0);
      showPreview(filteredThreads[0]);
    }
  });
}

function updateFocus(index) {
  document.querySelectorAll('.chat-item').forEach((item) => {
    item.classList.toggle('focused', parseInt(item.dataset.index) === index);
  });
}

function scrollToFocused() {
  const focused = document.querySelector('.chat-item.focused');
  if (focused) {
    focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function openThread(item) {
  const url = buildProviderUrl(item);
  window.open(url, '_blank');
}

function buildProviderUrl(item) {
  const storedUrl = item.dataset.url;
  if (storedUrl && storedUrl.startsWith('http')) {
    return storedUrl;
  }

  const provider = item.dataset.provider;
  const providerThreadId = item.dataset.providerThreadId;

  switch (provider) {
    case 'chatgpt':
      return `https://chatgpt.com/c/${providerThreadId}`;
    case 'claude':
      return `https://claude.ai/chat/${providerThreadId}`;
    case 'gemini':
      return `https://gemini.google.com/app/${providerThreadId}`;
    case 'grok':
      return `https://grok.com/c/${providerThreadId}`;
    case 'copilot':
      return `https://copilot.microsoft.com`;
    default:
      return '#';
  }
}
