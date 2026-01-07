/**
 * Liberator Popup - Tabbed interface with Search and Sync
 */

// State
let allThreads = [];
let filteredThreads = [];
let focusedIndex = -1;
let selectedProvider = '';
let searchQuery = '';
let expandedThreadId = null;
let peekThread = null;
let messageCache = new Map();
let logEntries = [];
let queueRefreshInterval = null;
const MAX_LOG_ENTRIES = 100;

// Provider icons (compact SVG)
const PROVIDER_ICONS = {
  chatgpt: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9 5.98 5.98 0 0 0 4.5 2.01 6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.74-7.07z"/></svg>',
  claude: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>',
  gemini: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
  grok: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24H16.17l-5.21-6.82L4.99 21.75H1.68l7.73-8.84L1.25 2.25H8.08l4.71 6.23z"/></svg>',
  copilot: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>',
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Popup] Initializing...');
  await loadThreads();
  await loadQueueStats();
  setupTabSwitching();
  setupSearchTab();
  setupSyncTab();
  setupKeyboardShortcuts();
  setupSettingsDropdown();
  addLogEntry('info', 'Popup opened');
});

// ============ TAB SWITCHING ============

function setupTabSwitching() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');
}

// ============ SEARCH TAB ============

async function loadThreads() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'LIST_THREADS',
      filters: selectedProvider ? { provider: selectedProvider } : {},
    });

    if (response?.error) throw new Error(response.error);

    allThreads = response?.threads || [];
    console.log('[Popup] Loaded', allThreads.length, 'threads');
    applyFiltersAndRender();
  } catch (err) {
    console.error('[Popup] Failed to load threads:', err);
    document.getElementById('chat-list').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Failed to load</div>
        <div class="empty-state-subtitle">${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}

function applyFiltersAndRender() {
  let threads = [...allThreads];

  if (selectedProvider) {
    threads = threads.filter(t => t.provider === selectedProvider);
  }

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    threads = threads.filter(t =>
      (t.title || '').toLowerCase().includes(query) ||
      (t.summary || '').toLowerCase().includes(query)
    );
  }

  // Sort by last synced
  threads.sort((a, b) => new Date(b.last_synced_at) - new Date(a.last_synced_at));

  filteredThreads = threads;
  renderChatList();
}

function renderChatList() {
  const container = document.getElementById('chat-list');

  if (filteredThreads.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
        </div>
        <div class="empty-state-title">${searchQuery ? 'No matching conversations' : 'No conversations yet'}</div>
        <div class="empty-state-subtitle">${searchQuery ? 'Try a different search' : 'Sync from AI chat sites to get started'}</div>
      </div>
    `;
    return;
  }

  const html = filteredThreads.map((thread, index) => renderChatItem(thread, index)).join('');
  container.innerHTML = html;

  // Add click handlers
  container.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.preview-btn')) return; // Don't expand on button click
      toggleExpand(item.dataset.id);
    });
  });
}

function renderChatItem(thread, index) {
  const provider = thread.provider || 'chatgpt';
  const icon = PROVIDER_ICONS[provider] || PROVIDER_ICONS.chatgpt;
  const time = formatTime(thread.last_synced_at);
  const isExpanded = expandedThreadId === thread.id;
  const isFocused = focusedIndex === index;
  const attachmentBadges = getAttachmentBadges(thread.attachment_types);

  return `
    <div class="chat-item ${isExpanded ? 'expanded' : ''} ${isFocused ? 'focused' : ''}"
         data-id="${thread.id}"
         data-index="${index}"
         data-provider="${provider}"
         data-url="${escapeHtml(thread.url || '')}">
      <div class="chat-item-header">
        <div class="chat-provider-icon ${provider}">${icon}</div>
        <div class="chat-info">
          <div class="chat-title">${escapeHtml(thread.title || 'Untitled')}</div>
          <div class="chat-meta">
            <span>${thread.message_count || 0} messages</span>
            ${attachmentBadges ? `<span class="chat-attachments">${attachmentBadges}</span>` : ''}
          </div>
        </div>
        <span class="chat-time">${time}</span>
      </div>
      ${isExpanded ? `
        <div class="chat-preview" id="preview-${thread.id}">
          <div style="color: var(--text-muted); font-size: 11px;">Loading...</div>
        </div>
      ` : ''}
    </div>
  `;
}

async function toggleExpand(threadId) {
  if (expandedThreadId === threadId) {
    expandedThreadId = null;
  } else {
    expandedThreadId = threadId;
  }

  renderChatList();

  if (expandedThreadId) {
    await loadPreviewMessages(threadId);
  }
}

async function loadPreviewMessages(threadId) {
  const previewEl = document.getElementById(`preview-${threadId}`);
  if (!previewEl) return;

  // Check cache
  if (messageCache.has(threadId)) {
    renderPreviewMessages(previewEl, messageCache.get(threadId), threadId);
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_THREAD',
      threadId,
    });

    if (response?.error) throw new Error(response.error);

    // Use response.messages (full list from messages store), not response.thread.messages (embedded preview)
    const rawMessages = response?.messages || [];
    // Deduplicate and sort by index
    const messages = deduplicateMessages(rawMessages).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    messageCache.set(threadId, messages);
    renderPreviewMessages(previewEl, messages, threadId);
  } catch (err) {
    previewEl.innerHTML = `<div style="color: var(--text-muted);">Failed to load</div>`;
  }
}

function renderPreviewMessages(container, messages, threadId) {
  const thread = filteredThreads.find(t => t.id === threadId);

  if (messages.length === 0) {
    container.innerHTML = `
      <div style="color: var(--text-muted); font-size: 11px;">No messages yet</div>
    `;
    return;
  }

  // Show first 3 messages
  const preview = messages.slice(0, 3);

  container.innerHTML = `
    ${preview.map(msg => `
      <div class="preview-message">
        <div class="preview-role ${msg.role}">${msg.role}</div>
        <div class="preview-text">${renderMarkdown((msg.text || msg.content || '').slice(0, 300))}</div>
      </div>
    `).join('')}
    ${messages.length > 3 ? `<div style="color: var(--text-muted); font-size: 10px; margin-top: 6px;">+${messages.length - 3} more messages</div>` : ''}
    <div class="preview-actions">
      <button class="preview-btn secondary" data-action="peek" data-id="${threadId}">Peek</button>
      <button class="preview-btn secondary" data-action="copy" data-id="${threadId}">Copy Link</button>
      <button class="preview-btn primary" data-action="open" data-id="${threadId}">Open</button>
    </div>
  `;

  // Action handlers
  container.querySelectorAll('.preview-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const thread = filteredThreads.find(t => t.id === id);

      if (action === 'open') openChat(thread);
      else if (action === 'copy') copyLink(thread);
      else if (action === 'peek') showPeekModal(thread);
    });
  });
}

function setupSearchTab() {
  // Search input
  const searchInput = document.getElementById('search-input');
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchQuery = e.target.value.trim();
      focusedIndex = -1;
      expandedThreadId = null;
      applyFiltersAndRender();
    }, 150);
  });

  // Provider pills
  document.querySelectorAll('.provider-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.provider-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedProvider = pill.dataset.provider;
      focusedIndex = -1;
      expandedThreadId = null;
      loadThreads();
    });
  });

  // Open full search button
  document.getElementById('open-search').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('ui/search.html') });
  });
}

// ============ PEEK MODAL ============

function showPeekModal(thread) {
  if (!thread) return;
  peekThread = thread;

  document.getElementById('peek-title').textContent = thread.title || 'Untitled';
  document.getElementById('peek-modal').classList.add('visible');

  const messagesEl = document.getElementById('peek-messages');
  const messages = messageCache.get(thread.id) || [];

  if (messages.length === 0) {
    messagesEl.innerHTML = `<div style="color: var(--text-muted);">No messages</div>`;
    return;
  }

  // Show more messages in peek
  const displayMessages = messages.slice(0, 10);
  messagesEl.innerHTML = displayMessages.map(msg => `
    <div class="peek-message">
      <div class="peek-message-role ${msg.role}">${msg.role}</div>
      <div class="peek-message-text">${renderMarkdown((msg.text || msg.content || '').slice(0, 2000))}</div>
    </div>
  `).join('');

  if (messages.length > 10) {
    messagesEl.innerHTML += `<div style="color: var(--text-muted); text-align: center; padding: 12px;">+${messages.length - 10} more messages</div>`;
  }

  // Setup peek modal buttons
  document.getElementById('peek-close').onclick = closePeekModal;
  document.getElementById('peek-open').onclick = () => { openChat(peekThread); closePeekModal(); };
  document.getElementById('peek-copy').onclick = () => copyLink(peekThread);
  document.getElementById('peek-pin').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL(`ui/search.html?pinned=${peekThread.id}`) });
    closePeekModal();
  };
}

function closePeekModal() {
  document.getElementById('peek-modal').classList.remove('visible');
  peekThread = null;
}

// ============ SYNC TAB ============

function setupSyncTab() {
  // Sync current tab
  document.getElementById('sync-tab').addEventListener('click', syncCurrentTab);

  // Queue controls
  document.getElementById('queue-discover').addEventListener('click', discoverAndQueue);
  document.getElementById('queue-start').addEventListener('click', startQueueSync);
  document.getElementById('queue-pause').addEventListener('click', pauseQueueSync);
  document.getElementById('queue-resume').addEventListener('click', resumeQueueSync);
  document.getElementById('queue-stop').addEventListener('click', stopQueueSync);
  document.getElementById('queue-retry').addEventListener('click', retryFailed);

  // Log panel toggle
  document.getElementById('log-toggle').addEventListener('click', toggleLog);

  // Listen for log broadcasts
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'LOG_BROADCAST') {
      addLogEntry(message.tag, message.message, message.logType || 'info');
    }
  });
}

async function syncCurrentTab() {
  const btn = document.getElementById('sync-tab');
  btn.textContent = 'Syncing...';
  btn.disabled = true;
  addLogEntry('sync', 'Syncing current tab...');

  try {
    const result = await chrome.runtime.sendMessage({ type: 'SYNC_THREADS' });

    if (!result?.success) {
      addLogEntry('error', 'Sync failed: ' + (result?.error || 'unknown'), 'error');
    } else if (result.synced.length === 0) {
      addLogEntry('info', 'No AI tabs found');
    } else {
      addLogEntry('success', `Synced ${result.synced.length} threads`, 'success');
    }
  } catch (err) {
    addLogEntry('error', 'Sync error: ' + err.message, 'error');
  } finally {
    btn.textContent = 'Sync Current Tab';
    btn.disabled = false;
    await loadThreads();
  }
}

async function discoverAndQueue() {
  const btn = document.getElementById('queue-discover');
  btn.textContent = 'Scanning...';
  btn.disabled = true;
  addLogEntry('sync', 'Discovering chats...');

  try {
    const discoverResult = await chrome.runtime.sendMessage({ type: 'DISCOVER_CHATS' });
    if (!discoverResult?.success) {
      addLogEntry('error', 'Discovery failed', 'error');
      return;
    }

    const total = discoverResult.discovered?.total || 0;
    addLogEntry('info', `Found ${total} chats`);

    const queueResult = await chrome.runtime.sendMessage({ type: 'QUEUE_DISCOVERED' });
    if (queueResult?.success) {
      addLogEntry('success', `Queued ${queueResult.queued || 0} chats`, 'success');
    }
  } catch (err) {
    addLogEntry('error', 'Error: ' + err.message, 'error');
  } finally {
    btn.textContent = 'Discover Chats';
    btn.disabled = false;
    await loadQueueStats();
  }
}

async function loadQueueStats() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'GET_QUEUE_STATS' });
    if (!result?.success) return;

    const { stats, isRunning, isPaused } = result;

    document.getElementById('queue-pending').textContent = stats.pending;
    document.getElementById('queue-syncing').textContent = stats.syncing;
    document.getElementById('queue-completed').textContent = stats.completed;
    document.getElementById('queue-failed').textContent = stats.failed;

    // Update badge on sync tab
    const badge = document.getElementById('queue-badge');
    if (stats.pending > 0) {
      badge.textContent = stats.pending;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }

    // Progress bar
    const total = stats.total;
    const completed = stats.completed;
    const progressBar = document.getElementById('queue-progress-bar');
    const progressFill = document.getElementById('queue-progress-fill');

    if (total > 0 && isRunning) {
      progressBar.style.display = 'block';
      const pct = Math.round((completed / total) * 100);
      progressFill.style.width = `${pct}%`;
    } else {
      progressBar.style.display = 'none';
    }

    // Update status badge and buttons
    const statusEl = document.getElementById('queue-status');
    const startBtn = document.getElementById('queue-start');
    const pauseBtn = document.getElementById('queue-pause');
    const resumeBtn = document.getElementById('queue-resume');
    const stopBtn = document.getElementById('queue-stop');

    if (isRunning && !isPaused) {
      statusEl.textContent = 'Running';
      statusEl.className = 'sync-status-badge running';
      startBtn.style.display = 'none';
      pauseBtn.style.display = 'inline-block';
      resumeBtn.style.display = 'none';
      stopBtn.style.display = 'inline-block';
    } else if (isRunning && isPaused) {
      statusEl.textContent = 'Paused';
      statusEl.className = 'sync-status-badge paused';
      startBtn.style.display = 'none';
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'inline-block';
      stopBtn.style.display = 'inline-block';
    } else {
      statusEl.textContent = stats.pending > 0 ? `${stats.pending} pending` : 'Idle';
      statusEl.className = 'sync-status-badge idle';
      startBtn.style.display = 'inline-block';
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'none';
      stopBtn.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to load queue stats:', err);
  }
}

async function startQueueSync() {
  addLogEntry('queue', 'Starting background sync...');
  try {
    await chrome.runtime.sendMessage({ type: 'START_QUEUE_SYNC' });
    addLogEntry('success', 'Sync started', 'success');
    startQueueRefresh();
  } catch (err) {
    addLogEntry('error', 'Start error: ' + err.message, 'error');
  }
  await loadQueueStats();
}

async function pauseQueueSync() {
  addLogEntry('queue', 'Pausing sync...');
  try {
    await chrome.runtime.sendMessage({ type: 'PAUSE_QUEUE_SYNC' });
    addLogEntry('info', 'Sync paused');
  } catch (err) {
    addLogEntry('error', 'Pause error: ' + err.message, 'error');
  }
  await loadQueueStats();
}

async function resumeQueueSync() {
  addLogEntry('queue', 'Resuming sync...');
  try {
    await chrome.runtime.sendMessage({ type: 'RESUME_QUEUE_SYNC' });
    addLogEntry('success', 'Sync resumed', 'success');
  } catch (err) {
    addLogEntry('error', 'Resume error: ' + err.message, 'error');
  }
  await loadQueueStats();
}

async function stopQueueSync() {
  addLogEntry('queue', 'Stopping sync...');
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_QUEUE_SYNC' });
    addLogEntry('info', 'Sync stopped');
    stopQueueRefresh();
  } catch (err) {
    addLogEntry('error', 'Stop error: ' + err.message, 'error');
  }
  await loadQueueStats();
}

async function retryFailed() {
  addLogEntry('queue', 'Retrying failed items...');
  try {
    const result = await chrome.runtime.sendMessage({ type: 'RETRY_FAILED' });
    if (result?.success) {
      addLogEntry('info', `Reset ${result.resetCount} items`);
    }
  } catch (err) {
    addLogEntry('error', 'Retry error: ' + err.message, 'error');
  }
  await loadQueueStats();
}

function startQueueRefresh() {
  if (queueRefreshInterval) return;
  queueRefreshInterval = setInterval(loadQueueStats, 2000);
}

function stopQueueRefresh() {
  if (queueRefreshInterval) {
    clearInterval(queueRefreshInterval);
    queueRefreshInterval = null;
  }
}

// ============ LOG PANEL ============

function addLogEntry(tag, message, type = 'info') {
  const entry = { time: new Date(), tag, message, type };
  logEntries.push(entry);
  if (logEntries.length > MAX_LOG_ENTRIES) logEntries.shift();
  renderLogEntry(entry);
}

function renderLogEntry(entry) {
  const container = document.getElementById('log-content');
  const empty = document.getElementById('log-empty');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = 'log-entry';
  el.innerHTML = `
    <span class="log-time">${formatLogTime(entry.time)}</span>
    <span class="log-tag ${entry.tag}">${entry.tag}</span>
    <span class="log-msg ${entry.type}">${escapeHtml(entry.message)}</span>
  `;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function formatLogTime(date) {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function toggleLog() {
  const content = document.getElementById('log-content');
  const icon = document.getElementById('log-toggle-icon');
  if (content.classList.contains('collapsed')) {
    content.classList.remove('collapsed');
    icon.textContent = '[-]';
  } else {
    content.classList.add('collapsed');
    icon.textContent = '[+]';
  }
}

// ============ SETTINGS DROPDOWN ============

function setupSettingsDropdown() {
  const btn = document.getElementById('settings-btn');
  const menu = document.getElementById('settings-menu');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('show');
  });

  document.addEventListener('click', () => menu.classList.remove('show'));

  // Menu items
  document.getElementById('open-settings').addEventListener('click', () => {
    menu.classList.remove('show');
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('reload').addEventListener('click', () => chrome.runtime.reload());

  document.getElementById('export-logs').addEventListener('click', async () => {
    menu.classList.remove('show');
    try {
      const stored = await chrome.storage.local.get('__threadhub_debug_logs__');
      const logs = stored['__threadhub_debug_logs__'] || [];
      const formatted = logs.map(log => {
        const time = new Date(log.t).toISOString();
        return `[${time}] ${(log.l || 'info').toUpperCase()} ${log.s || '?'} ${log.m}`;
      }).join('\n');
      await navigator.clipboard.writeText(formatted);
      addLogEntry('success', `Copied ${logs.length} logs to clipboard`, 'success');
    } catch (err) {
      addLogEntry('error', 'Export failed: ' + err.message, 'error');
    }
  });

  document.getElementById('dump-db').addEventListener('click', async () => {
    menu.classList.remove('show');
    addLogEntry('info', 'Exporting database...');
    try {
      const result = await chrome.runtime.sendMessage({ type: 'DEBUG_DUMP_DB' });
      if (result?.success) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        await chrome.downloads.download({ url, filename: `liberator-db-${timestamp}.json`, saveAs: false });
        addLogEntry('success', 'Database exported', 'success');
      }
    } catch (err) {
      addLogEntry('error', 'Export failed: ' + err.message, 'error');
    }
  });

  document.getElementById('cleanup-data').addEventListener('click', async () => {
    menu.classList.remove('show');
    addLogEntry('info', 'Running cleanup...');
    try {
      const result = await chrome.runtime.sendMessage({ type: 'CLEANUP_DATA' });
      if (result?.success) {
        addLogEntry('success', `Cleaned up: ${result.threadDuplicatesRemoved} threads, ${result.messageDuplicatesRemoved} messages`, 'success');
        await loadThreads();
      }
    } catch (err) {
      addLogEntry('error', 'Cleanup failed: ' + err.message, 'error');
    }
  });

  document.getElementById('queue-clear').addEventListener('click', async () => {
    menu.classList.remove('show');
    addLogEntry('info', 'Clearing queue...');
    try {
      const result = await chrome.runtime.sendMessage({ type: 'CLEAR_QUEUE' });
      if (result?.success) {
        addLogEntry('success', `Cleared ${result.count || 0} items`, 'success');
        loadQueueStats();
      }
    } catch (err) {
      addLogEntry('error', 'Clear failed: ' + err.message, 'error');
    }
  });

  document.getElementById('save-html').addEventListener('click', async () => {
    menu.classList.remove('show');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      let provider = 'unknown';
      if (tab.url.includes('claude.ai')) provider = 'claude';
      else if (tab.url.includes('chatgpt.com') || tab.url.includes('chat.openai.com')) provider = 'chatgpt';
      else if (tab.url.includes('gemini.google.com')) provider = 'gemini';
      else if (tab.url.includes('x.com') || tab.url.includes('grok')) provider = 'grok';

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({ html: document.documentElement.outerHTML, url: window.location.href }),
      });

      if (!results?.[0]?.result) return;

      const { html, url } = results[0].result;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${provider}-${timestamp}.html`;
      const blob = new Blob([`<!-- Source: ${url} -->\n${html}`], { type: 'text/html' });
      await chrome.downloads.download({ url: URL.createObjectURL(blob), filename: `liberator-fixtures/${filename}`, saveAs: false });
      addLogEntry('success', `Saved: ${filename}`, 'success');
    } catch (err) {
      addLogEntry('error', 'Save failed: ' + err.message, 'error');
    }
  });
}

// ============ KEYBOARD SHORTCUTS ============

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const searchInput = document.getElementById('search-input');
    const isSearchFocused = document.activeElement === searchInput;
    const isPeekOpen = document.getElementById('peek-modal').classList.contains('visible');

    // Close peek modal with Escape
    if (e.key === 'Escape') {
      if (isPeekOpen) {
        closePeekModal();
        return;
      }
      if (isSearchFocused) {
        searchInput.blur();
        return;
      }
    }

    // Cmd+K to open full search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('ui/search.html') });
      return;
    }

    // Don't handle shortcuts if search is focused (except Escape)
    if (isSearchFocused || isPeekOpen) return;

    // Focus search with /
    if (e.key === '/') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    // Navigate list with j/k or arrows
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (focusedIndex < filteredThreads.length - 1) {
        focusedIndex++;
        updateFocus();
      }
    }

    if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (focusedIndex > 0) {
        focusedIndex--;
        updateFocus();
      }
    }

    // Enter to expand or open
    if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      const thread = filteredThreads[focusedIndex];
      if (expandedThreadId === thread.id) {
        openChat(thread);
      } else {
        toggleExpand(thread.id);
      }
    }

    // P to peek
    if (e.key === 'p' && focusedIndex >= 0) {
      e.preventDefault();
      const thread = filteredThreads[focusedIndex];
      if (messageCache.has(thread.id)) {
        showPeekModal(thread);
      } else {
        // Load messages first, then show peek
        loadPreviewMessages(thread.id).then(() => showPeekModal(thread));
      }
    }

    // Tab switching with 1/2
    if (e.key === '1') switchTab('search');
    if (e.key === '2') switchTab('sync');
  });

  // Arrow down from search to start navigation
  document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && filteredThreads.length > 0) {
      e.preventDefault();
      e.target.blur();
      focusedIndex = 0;
      updateFocus();
    }
  });
}

function updateFocus() {
  document.querySelectorAll('.chat-item').forEach(item => {
    item.classList.toggle('focused', parseInt(item.dataset.index) === focusedIndex);
  });

  // Scroll focused into view
  const focused = document.querySelector('.chat-item.focused');
  if (focused) {
    focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
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

// ============ UTILITIES ============

function formatTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

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

function openChat(thread) {
  if (!thread) return;
  const url = buildProviderUrl(thread);
  window.open(url, '_blank');
}

function copyLink(thread) {
  if (!thread) return;
  const url = buildProviderUrl(thread);
  navigator.clipboard.writeText(url).then(() => {
    addLogEntry('success', 'Link copied', 'success');
  });
}

function buildProviderUrl(thread) {
  if (thread.url && thread.url.startsWith('http')) return thread.url;

  const provider = thread.provider;
  const id = thread.provider_thread_id;

  switch (provider) {
    case 'chatgpt': return `https://chatgpt.com/c/${id}`;
    case 'claude': return `https://claude.ai/chat/${id}`;
    case 'gemini': return `https://gemini.google.com/app/${id}`;
    case 'grok': return `https://grok.com/c/${id}`;
    case 'copilot': return `https://copilot.microsoft.com`;
    default: return '#';
  }
}

// Start queue refresh if running
loadQueueStats().then(() => {
  chrome.runtime.sendMessage({ type: 'GET_QUEUE_STATS' }).then((result) => {
    if (result?.isRunning) startQueueRefresh();
  });
});
