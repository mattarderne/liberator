/**
 * Universal Command Palette for AI Thread Hub
 * Accessible via Cmd+K on any supported AI chat page
 */

(function() {
  'use strict';

  let paletteOpen = false;
  let paletteEl = null;
  let selectedIndex = -1; // -1 means no selection (in search), 0+ for items
  let commands = [];
  let filteredCommands = [];
  let searchResults = [];
  let mode = 'search'; // 'search' or 'commands'
  let previewThread = null;
  let previewMessages = [];

  const PALETTE_STYLES = `
    .ath-palette-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 999999;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 100px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .ath-palette {
      width: 900px;
      max-width: 95vw;
      background: #1e1e1e;
      border: 1px solid #3a3a3a;
      border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .ath-palette-body {
      display: flex;
      flex: 1;
      min-height: 0;
    }
    .ath-palette-left {
      width: 340px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      border-right: 1px solid #3a3a3a;
    }
    .ath-palette-right {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .ath-palette-right.empty {
      display: flex;
      align-items: center;
      justify-content: center;
      color: #5a5a5a;
      font-size: 13px;
    }
    .ath-palette-input {
      width: 100%;
      padding: 16px 20px;
      background: transparent;
      border: none;
      border-bottom: 1px solid #3a3a3a;
      color: #ececec;
      font-size: 16px;
      outline: none;
    }
    .ath-palette-input::placeholder {
      color: #8e8e8e;
    }
    .ath-palette-results {
      flex: 1;
      overflow-y: auto;
      max-height: 350px;
    }
    .ath-palette-section {
      padding: 8px 12px 4px;
      font-size: 10px;
      font-weight: 600;
      color: #8e8e8e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .ath-palette-item {
      padding: 10px 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      color: #ececec;
    }
    .ath-palette-item:hover,
    .ath-palette-item.selected {
      background: #2f2f2f;
    }
    .ath-palette-icon {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      background: #2f2f2f;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }
    .ath-palette-item.selected .ath-palette-icon {
      background: #10a37f;
    }
    .ath-palette-text {
      flex: 1;
      min-width: 0;
    }
    .ath-palette-title {
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ath-palette-hint {
      font-size: 11px;
      color: #8e8e8e;
      margin-top: 2px;
    }
    .ath-palette-shortcut {
      font-size: 11px;
      color: #8e8e8e;
      padding: 2px 6px;
      background: #2f2f2f;
      border-radius: 4px;
    }
    .ath-palette-footer {
      padding: 10px 20px;
      border-top: 1px solid #3a3a3a;
      font-size: 11px;
      color: #8e8e8e;
      display: flex;
      gap: 16px;
    }
    .ath-palette-footer span {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .ath-palette-kbd {
      padding: 2px 6px;
      background: #2f2f2f;
      border: 1px solid #3a3a3a;
      border-radius: 4px;
      font-family: monospace;
      font-size: 10px;
    }
    .ath-palette-empty {
      padding: 20px;
      text-align: center;
      color: #8e8e8e;
      font-size: 13px;
    }
    .ath-palette-provider {
      font-size: 9px;
      padding: 2px 5px;
      border-radius: 3px;
      font-weight: 600;
      text-transform: uppercase;
      margin-left: 8px;
    }
    .ath-provider-chatgpt { background: #74d4a5; color: #0f2d1f; }
    .ath-provider-claude { background: #d4a574; color: #2d1f0f; }
    .ath-provider-gemini { background: #7494d4; color: #0f1f2d; }
    .ath-provider-grok { background: #d474a5; color: #2d0f1f; }
    .ath-provider-copilot { background: #a5a5d4; color: #1f1f2d; }

    /* Preview panel (right side) */
    .ath-preview-header {
      padding: 12px 16px;
      border-bottom: 1px solid #3a3a3a;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .ath-preview-title {
      flex: 1;
      font-size: 13px;
      font-weight: 600;
      color: #ececec;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ath-preview-content-wrapper {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      min-height: 120px;
    }
    .ath-preview-role {
      font-size: 10px;
      font-weight: 600;
      color: #8e8e8e;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .ath-preview-content {
      font-size: 13px;
      line-height: 1.6;
      color: #d4d4d4;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .ath-preview-empty {
      color: #5a5a5a;
      font-size: 13px;
      text-align: center;
      padding: 40px 20px;
    }
    .ath-preview-loading {
      padding: 40px 20px;
      text-align: center;
      color: #8e8e8e;
    }
    /* Prevent text selection breaking keyboard shortcuts */
    .ath-palette {
      user-select: none;
    }
    .ath-palette-input,
    .ath-preview-content {
      user-select: text;
    }
  `;

  // Define available commands
  function getCommands() {
    return [
      {
        id: 'sync',
        icon: '🔄',
        title: 'Sync this tab',
        hint: 'Save current conversation to Thread Hub',
        action: syncCurrentTab
      },
      {
        id: 'open-hub',
        icon: '📚',
        title: 'Open Thread Hub',
        hint: 'View all your saved threads',
        action: openThreadHub
      },
      {
        id: 'similar',
        icon: '✨',
        title: 'Find similar threads',
        hint: 'Find threads related to this conversation',
        action: findSimilar
      },
      {
        id: 'link',
        icon: '🔗',
        title: 'Link to another thread',
        hint: 'Connect this conversation to another thread',
        action: linkThread
      }
    ];
  }

  function injectStyles() {
    if (document.getElementById('ath-palette-styles')) return;
    const style = document.createElement('style');
    style.id = 'ath-palette-styles';
    style.textContent = PALETTE_STYLES;
    document.head.appendChild(style);
  }

  function createPalette() {
    if (paletteEl) return paletteEl;

    injectStyles();

    paletteEl = document.createElement('div');
    paletteEl.className = 'ath-palette-overlay';
    paletteEl.innerHTML = `
      <div class="ath-palette">
        <input type="text" class="ath-palette-input" placeholder="Search threads..." autofocus />
        <div class="ath-palette-body">
          <div class="ath-palette-left">
            <div class="ath-palette-results"></div>
          </div>
          <div class="ath-palette-right empty">
            <div class="ath-preview-empty">Select a thread to preview</div>
          </div>
        </div>
        <div class="ath-palette-footer">
          <span><span class="ath-palette-kbd">↑↓</span> navigate</span>
          <span><span class="ath-palette-kbd">↵</span> open</span>
          <span><span class="ath-palette-kbd">esc</span> close</span>
        </div>
      </div>
    `;

    // Close on overlay click
    paletteEl.addEventListener('click', (e) => {
      if (e.target === paletteEl) closePalette();
    });

    // Input handling
    const input = paletteEl.querySelector('.ath-palette-input');
    input.addEventListener('input', handleInput);
    input.addEventListener('keydown', handleKeydown);

    return paletteEl;
  }

  function openPalette() {
    if (paletteOpen) return;

    paletteOpen = true;
    mode = 'search';
    selectedIndex = -1;
    commands = getCommands();
    filteredCommands = [...commands];
    searchResults = [];
    previewThread = null;
    previewMessages = [];

    const palette = createPalette();
    document.body.appendChild(palette);

    const input = palette.querySelector('.ath-palette-input');
    input.value = '';
    input.placeholder = 'Search threads...';
    input.focus();

    renderResults();
  }

  function closePalette() {
    if (!paletteOpen) return;

    paletteOpen = false;
    if (paletteEl && paletteEl.parentNode) {
      paletteEl.parentNode.removeChild(paletteEl);
    }
  }

  function handleInput(e) {
    const query = e.target.value.trim().toLowerCase();

    if (mode === 'commands') {
      if (query) {
        filteredCommands = commands.filter(cmd =>
          cmd.title.toLowerCase().includes(query) ||
          cmd.hint.toLowerCase().includes(query)
        );
      } else {
        filteredCommands = [...commands];
      }
      selectedIndex = Math.min(selectedIndex, filteredCommands.length - 1);
      if (selectedIndex < 0 && filteredCommands.length > 0) selectedIndex = 0;
      renderResults();
    } else {
      // Search mode - debounce search
      selectedIndex = -1;
      clearTimeout(window._athSearchTimeout);
      window._athSearchTimeout = setTimeout(() => {
        performSearch(query);
      }, 200);
    }
  }

  async function performSearch(query) {
    if (!query) {
      searchResults = [];
      renderResults();
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TFIDF_SEARCH',
        query: query,
        topK: 10
      });

      searchResults = response?.results || [];
      selectedIndex = searchResults.length > 0 ? 0 : -1;
      renderResults();
      updatePreview();
    } catch (err) {
      console.error('Search failed:', err);
      searchResults = [];
      renderResults();
    }
  }

  function handleKeydown(e) {
    // Keep focus on input for keyboard shortcuts
    const input = paletteEl.querySelector('.ath-palette-input');
    if (document.activeElement !== input && e.key !== 'Escape') {
      input.focus();
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        if (mode === 'commands') {
          // Go back to search mode
          mode = 'search';
          selectedIndex = -1;
          input.placeholder = 'Search threads...';
          renderResults();
          updatePreview();
        } else {
          closePalette();
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (mode === 'search') {
          if (searchResults.length > 0) {
            // Navigate search results
            selectedIndex = Math.min(selectedIndex + 1, searchResults.length - 1);
            renderResults();
            updatePreview();
          } else {
            // No search results, switch to commands
            mode = 'commands';
            selectedIndex = 0;
            filteredCommands = [...commands];
            input.value = '';
            input.placeholder = 'Filter commands...';
            renderResults();
            updatePreview();
          }
        } else {
          // Commands mode
          selectedIndex = Math.min(selectedIndex + 1, filteredCommands.length - 1);
          renderResults();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (mode === 'commands') {
          if (selectedIndex <= 0) {
            // At top of commands, go back to search
            mode = 'search';
            selectedIndex = searchResults.length > 0 ? searchResults.length - 1 : -1;
            input.placeholder = 'Search threads...';
            renderResults();
            updatePreview();
          } else {
            selectedIndex--;
            renderResults();
          }
        } else {
          // Search mode
          if (selectedIndex > 0) {
            selectedIndex--;
            renderResults();
            updatePreview();
          }
        }
        break;

      case 'Enter':
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) {
          // Cmd+Enter: open in new tab
          if (mode === 'search' && searchResults[selectedIndex]) {
            openThread(searchResults[selectedIndex].thread);
          }
        } else {
          // Regular Enter: execute command or open thread
          if (mode === 'commands' && filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
          } else if (mode === 'search' && searchResults[selectedIndex]) {
            openThread(searchResults[selectedIndex].thread);
          }
        }
        break;
    }
  }

  function renderResults() {
    const resultsEl = paletteEl.querySelector('.ath-palette-results');

    if (mode === 'commands') {
      if (filteredCommands.length === 0) {
        resultsEl.innerHTML = '<div class="ath-palette-empty">No commands found</div>';
        return;
      }

      resultsEl.innerHTML = `
        <div class="ath-palette-section">Commands</div>
        ${filteredCommands.map((cmd, i) => `
          <div class="ath-palette-item ${i === selectedIndex ? 'selected' : ''}" data-index="${i}" data-mode="commands">
            <div class="ath-palette-icon">${cmd.icon}</div>
            <div class="ath-palette-text">
              <div class="ath-palette-title">${cmd.title}</div>
              <div class="ath-palette-hint">${cmd.hint}</div>
            </div>
          </div>
        `).join('')}
      `;
    } else {
      // Search mode
      const input = paletteEl.querySelector('.ath-palette-input');
      const query = input.value.trim();

      if (searchResults.length === 0) {
        if (query) {
          resultsEl.innerHTML = '<div class="ath-palette-empty">No threads found. Press ↓ for commands.</div>';
        } else {
          resultsEl.innerHTML = '<div class="ath-palette-empty">Type to search threads, or press ↓ for commands</div>';
        }
        return;
      }

      resultsEl.innerHTML = `
        <div class="ath-palette-section">Threads</div>
        ${searchResults.map((result, i) => {
          const thread = result.thread;
          const providerClass = `ath-provider-${thread.provider}`;
          return `
            <div class="ath-palette-item ${i === selectedIndex ? 'selected' : ''}" data-index="${i}" data-mode="search">
              <div class="ath-palette-icon">💬</div>
              <div class="ath-palette-text">
                <div class="ath-palette-title">
                  ${escapeHtml(thread.title || 'Untitled')}
                  <span class="ath-palette-provider ${providerClass}">${thread.provider}</span>
                </div>
                <div class="ath-palette-hint">${escapeHtml(result.snippet || '')}</div>
              </div>
            </div>
          `;
        }).join('')}
      `;
    }

    // Add click handlers
    resultsEl.querySelectorAll('.ath-palette-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const index = parseInt(item.dataset.index);
        if (mode === 'commands' && filteredCommands[index]) {
          filteredCommands[index].action();
        } else if (mode === 'search' && searchResults[index]) {
          if (e.metaKey || e.ctrlKey) {
            // Cmd+Click opens in new tab
            openThread(searchResults[index].thread);
          } else {
            // Regular click selects and updates preview
            selectedIndex = index;
            renderResults();
            updatePreview();
          }
        }
      });
      // Double-click opens thread
      item.addEventListener('dblclick', () => {
        const index = parseInt(item.dataset.index);
        if (mode === 'search' && searchResults[index]) {
          openThread(searchResults[index].thread);
        }
      });
    });

    // Scroll selected into view
    const selected = resultsEl.querySelector('.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Command actions
  async function syncCurrentTab() {
    closePalette();

    // Trigger sync via the provider's content script
    if (window.threadHubProvider && window.threadHubProvider.syncNow) {
      window.threadHubProvider.syncNow();
    } else {
      // Fallback: send message to trigger sync
      try {
        await chrome.runtime.sendMessage({ type: 'SYNC_CURRENT_TAB' });
      } catch (err) {
        console.error('Failed to sync:', err);
      }
    }
  }

  function openThreadHub() {
    closePalette();
    chrome.runtime.sendMessage({ type: 'OPEN_THREAD_HUB' });
  }

  async function findSimilar() {
    closePalette();

    // Get current thread ID from the provider
    const threadId = getCurrentThreadId();
    if (threadId) {
      chrome.runtime.sendMessage({
        type: 'OPEN_THREAD_HUB',
        threadId: threadId,
        action: 'similar'
      });
    } else {
      // Sync first, then find similar
      alert('Please sync this conversation first to find similar threads.');
    }
  }

  async function linkThread() {
    closePalette();

    const threadId = getCurrentThreadId();
    if (threadId) {
      chrome.runtime.sendMessage({
        type: 'OPEN_THREAD_HUB',
        threadId: threadId,
        action: 'link'
      });
    } else {
      alert('Please sync this conversation first to link threads.');
    }
  }

  function openThread(thread) {
    closePalette();

    // Open in Thread Hub via background script for reliability
    chrome.runtime.sendMessage({
      type: 'OPEN_THREAD_HUB',
      threadId: thread.id
    });
  }

  async function updatePreview() {
    const rightPanel = paletteEl.querySelector('.ath-palette-right');
    if (!rightPanel) return;

    // If no selection or in commands mode, show empty state
    if (mode === 'commands' || selectedIndex < 0 || !searchResults[selectedIndex]) {
      rightPanel.className = 'ath-palette-right empty';
      rightPanel.innerHTML = '<div class="ath-preview-empty">Select a thread to preview</div>';
      previewThread = null;
      previewMessages = [];
      return;
    }

    const thread = searchResults[selectedIndex].thread;

    // If same thread, don't refetch
    if (previewThread?.id === thread.id && previewMessages.length > 0) {
      return;
    }

    previewThread = thread;
    const providerClass = `ath-provider-${thread.provider}`;

    // Show loading state
    rightPanel.className = 'ath-palette-right';
    rightPanel.innerHTML = `
      <div class="ath-preview-header">
        <div class="ath-preview-title">
          ${escapeHtml(thread.title || 'Untitled')}
          <span class="ath-palette-provider ${providerClass}">${thread.provider}</span>
        </div>
      </div>
      <div class="ath-preview-loading">Loading...</div>
    `;

    // Fetch messages
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_THREAD_MESSAGES',
        threadId: thread.id
      });

      // Check if still showing same thread
      if (previewThread?.id !== thread.id) return;

      previewMessages = response?.messages || [];
      const firstMessage = previewMessages.find(m => m.role === 'user') || previewMessages[0];
      const messageText = firstMessage?.text || firstMessage?.content || '';

      rightPanel.innerHTML = `
        <div class="ath-preview-header">
          <div class="ath-preview-title">
            ${escapeHtml(thread.title || 'Untitled')}
            <span class="ath-palette-provider ${providerClass}">${thread.provider}</span>
          </div>
        </div>
        <div class="ath-preview-content-wrapper">
          ${firstMessage && messageText ? `
            <div class="ath-preview-role">${firstMessage.role}</div>
            <div class="ath-preview-content">${escapeHtml(messageText)}</div>
          ` : '<div class="ath-preview-empty">No messages</div>'}
        </div>
      `;
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      rightPanel.innerHTML = `
        <div class="ath-preview-header">
          <div class="ath-preview-title">
            ${escapeHtml(thread.title || 'Untitled')}
            <span class="ath-palette-provider ${providerClass}">${thread.provider}</span>
          </div>
        </div>
        <div class="ath-preview-empty">Failed to load preview</div>
      `;
    }
  }

  function getCurrentThreadId() {
    // Try to get the current thread ID from the provider's content script
    if (window.threadHubProvider && window.threadHubProvider.getCurrentThreadId) {
      return window.threadHubProvider.getCurrentThreadId();
    }

    // Fallback: try to extract from URL
    const url = window.location.href;

    // ChatGPT: /c/xxx or /g/xxx
    let match = url.match(/chatgpt\.com\/(?:c|g)\/([a-f0-9-]+)/i);
    if (match) return `chatgpt-${match[1]}`;

    // Claude: /chat/xxx
    match = url.match(/claude\.ai\/chat\/([a-f0-9-]+)/i);
    if (match) return `claude-${match[1]}`;

    // Gemini: various patterns
    match = url.match(/gemini\.google\.com\/.*[?&]c=([^&]+)/);
    if (match) return `gemini-${match[1]}`;

    // Grok: /conversation/xxx
    match = url.match(/grok\.com\/.*\/([a-f0-9-]+)/i);
    if (match) return `grok-${match[1]}`;

    return null;
  }

  // Keyboard listener
  function handleGlobalKeydown(e) {
    // Cmd+K or Ctrl+K
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      e.stopPropagation();

      if (paletteOpen) {
        closePalette();
      } else {
        openPalette();
      }
    }
  }

  // Initialize
  function init() {
    // Use capture phase to intercept before the page's handlers
    document.addEventListener('keydown', handleGlobalKeydown, true);

    console.log('[AI Thread Hub] Command palette ready (Cmd+K)');
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
