/**
 * Sync Status Indicators for Thread Sidebar
 *
 * Injects small sync status dots into the native AI chat sidebar.
 * Supports: Gemini, ChatGPT, Claude, Grok, Copilot
 */

(function() {
  'use strict';

  const INDICATOR_CLASS = 'threadhub-sync-dot';
  const CHECK_INTERVAL_MS = 30000; // Refresh every 30s
  const DEBOUNCE_MS = 500;

  let checkInterval = null;
  let syncStatusCache = new Map(); // providerThreadId -> status
  let debounceTimer = null;

  /**
   * Get the current provider from the URL
   */
  function getProvider() {
    const host = window.location.hostname;
    if (host.includes('gemini.google.com')) return 'gemini';
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
    if (host.includes('claude.ai')) return 'claude';
    if (host.includes('grok.com') || host.includes('x.com')) return 'grok';
    if (host.includes('copilot.microsoft.com') || host.includes('m365.cloud.microsoft')) return 'copilot';
    return null;
  }

  /**
   * Inject styles
   */
  function injectStyles() {
    if (document.getElementById('threadhub-sync-styles')) return;

    const style = document.createElement('style');
    style.id = 'threadhub-sync-styles';
    style.textContent = `
      .${INDICATOR_CLASS} {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
        margin-right: 6px;
        opacity: 0.9;
        display: inline-block;
        vertical-align: middle;
      }
      .${INDICATOR_CLASS}.synced { background: #22c55e; }
      .${INDICATOR_CLASS}.stale { background: #eab308; }
      .${INDICATOR_CLASS}.old { background: #f97316; }
      .${INDICATOR_CLASS}.not-synced { background: #6b7280; }
      /* Gemini-specific positioning */
      .conversation > .${INDICATOR_CLASS},
      [data-test-id="conversation"] > .${INDICATOR_CLASS} {
        position: absolute;
        left: 4px;
        top: 50%;
        transform: translateY(-50%);
        margin-right: 0;
      }
      .conversation,
      [data-test-id="conversation"] {
        position: relative;
        padding-left: 14px !important;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Extract thread ID from a conversation element based on provider
   */
  function extractThreadIdFromElement(el, provider) {
    // For Gemini, check jslog first (no link needed)
    if (provider === 'gemini') {
      const jslog = el.getAttribute('jslog') || '';
      // Match pattern: "c_<hexid>" inside BardVeMetadataKey (with escaped or unescaped quotes)
      const jslogMatch = jslog.match(/\\?"(c_[a-f0-9]+)\\?"/);
      if (jslogMatch) return jslogMatch[1].replace(/^c_/, '');
      const jslogMatch2 = jslog.match(/"(c_[a-f0-9]+)"/);
      if (jslogMatch2) return jslogMatch2[1].replace(/^c_/, '');
      // Try &quot; encoded quotes
      const jslogMatch3 = jslog.match(/&quot;(c_[a-f0-9]+)&quot;/);
      if (jslogMatch3) return jslogMatch3[1].replace(/^c_/, '');
      return null;
    }

    const link = el.tagName === 'A' ? el : el.querySelector('a');
    if (!link) return null;

    const href = link.getAttribute('href') || '';

    switch (provider) {

      case 'chatgpt': {
        // /c/<uuid> format
        const chatMatch = href.match(/\/c\/([a-f0-9-]+)/i);
        if (chatMatch) return chatMatch[1];
        // /codex/tasks/task_b_<id> format
        const codexTaskMatch = href.match(/\/codex\/tasks\/(task_b_[a-f0-9]+)/i);
        if (codexTaskMatch) return codexTaskMatch[1];
        // /codex/<uuid> format (fallback)
        const codexMatch = href.match(/\/codex\/([a-f0-9-]+)/i);
        if (codexMatch) return codexMatch[1];
        // /g/g-<id> format (GPTs)
        const gptMatch = href.match(/\/g\/(g-[a-zA-Z0-9-]+)/);
        if (gptMatch) return gptMatch[1];
        break;
      }

      case 'claude': {
        // /chat/<uuid> format
        const chatMatch = href.match(/\/chat\/([a-f0-9-]+)/i);
        if (chatMatch) return chatMatch[1];
        // /code/<uuid> format
        const codeMatch = href.match(/\/code\/([a-f0-9-]+)/i);
        if (codeMatch) return codeMatch[1];
        // /project/<uuid>/chat/<uuid> format
        const projectChatMatch = href.match(/\/project\/[^/]+\/chat\/([a-f0-9-]+)/i);
        if (projectChatMatch) return projectChatMatch[1];
        break;
      }

      case 'grok': {
        // /c/<uuid> format
        const chatMatch = href.match(/\/c\/([a-f0-9-]+)/i);
        if (chatMatch) return chatMatch[1];
        // Hash-based #<id>
        if (href.includes('#') && !href.includes('#private')) {
          const hash = href.split('#')[1];
          if (hash) return hash;
        }
        break;
      }

      case 'copilot': {
        // /chats/<id> format (personal)
        const chatsMatch = href.match(/\/chats\/([^/?]+)/);
        if (chatsMatch) return chatsMatch[1];
        // ?chatId=<id> format (M365)
        const chatIdMatch = href.match(/chatId=([^&]+)/);
        if (chatIdMatch) return 'm365-' + chatIdMatch[1];
        break;
      }
    }

    return null;
  }

  /**
   * Get sync status class and tooltip
   */
  function getSyncStatusInfo(syncData) {
    if (!syncData || !syncData.last_synced_at) {
      return { class: 'not-synced', tooltip: 'Not synced' };
    }

    const date = new Date(syncData.last_synced_at);
    const now = new Date();
    const diff = now - date;
    const hours = diff / 3600000;
    const days = diff / 86400000;

    if (hours < 24) {
      return { class: 'synced', tooltip: 'Synced recently' };
    }
    if (days < 7) {
      return { class: 'stale', tooltip: `Synced ${Math.floor(days)}d ago` };
    }
    return { class: 'old', tooltip: `Synced ${Math.floor(days)}d ago` };
  }

  /**
   * Create or update sync indicator for a conversation element
   */
  function updateIndicator(conversationEl, threadId) {
    // Find or create indicator
    let indicator = conversationEl.querySelector(`.${INDICATOR_CLASS}`);

    if (!indicator) {
      indicator = document.createElement('span');
      indicator.className = INDICATOR_CLASS;

      // Find a good insertion point - prefer the link or first child
      const link = conversationEl.tagName === 'A' ? conversationEl : conversationEl.querySelector('a');
      const target = link || conversationEl;

      // Insert at the start
      if (target.firstChild) {
        target.insertBefore(indicator, target.firstChild);
      } else {
        target.appendChild(indicator);
      }
    }

    // Update status from cache
    const syncData = syncStatusCache.get(threadId);
    const status = getSyncStatusInfo(syncData);

    indicator.className = `${INDICATOR_CLASS} ${status.class}`;
    indicator.title = status.tooltip;
  }

  /**
   * Find all conversation elements in the sidebar based on provider
   */
  function findConversationElements(provider) {
    const elements = [];
    const seen = new Set();

    function addElement(el) {
      if (!seen.has(el)) {
        seen.add(el);
        elements.push(el);
      }
    }

    switch (provider) {
      case 'gemini': {
        // Gemini uses div elements with data-test-id="conversation" and jslog containing thread ID
        document.querySelectorAll('[data-test-id="conversation"]').forEach(addElement);
        // Also try finding by class
        document.querySelectorAll('.conversation[jslog*="BardVeMetadataKey"]').forEach(addElement);
        // Fallback: any element with jslog containing c_ thread ID
        document.querySelectorAll('[jslog*="\\"c_"]').forEach(el => {
          if (el.classList.contains('conversation') || el.getAttribute('data-test-id') === 'conversation') {
            addElement(el);
          }
        });
        break;
      }

      case 'chatgpt': {
        // Sidebar nav links for chats
        document.querySelectorAll('nav a[href*="/c/"]').forEach(addElement);
        document.querySelectorAll('nav a[href*="/g/g-"]').forEach(addElement);
        document.querySelectorAll('[data-testid="conversation-item"] a').forEach(addElement);
        // Codex task links - in task list on /codex page
        document.querySelectorAll('.task-row-container a[href*="/codex/tasks/"]').forEach(addElement);
        document.querySelectorAll('a[href*="/codex/tasks/"]').forEach(addElement);
        break;
      }

      case 'claude': {
        // Sidebar chat links
        document.querySelectorAll('a[href*="/chat/"]').forEach(el => {
          // Skip if it's the main content area
          if (!el.closest('[class*="message"], [class*="content-area"]')) {
            addElement(el);
          }
        });
        document.querySelectorAll('a[href*="/code/"]').forEach(el => {
          if (!el.closest('[class*="message"], [class*="content-area"]')) {
            addElement(el);
          }
        });
        break;
      }

      case 'grok': {
        // Sidebar chat links
        document.querySelectorAll('a[href*="/c/"]').forEach(addElement);
        break;
      }

      case 'copilot': {
        // Chat history links
        document.querySelectorAll('a[href*="/chats/"]').forEach(addElement);
        document.querySelectorAll('a[href*="chatId="]').forEach(addElement);
        break;
      }
    }

    return elements;
  }

  /**
   * Fetch sync status for multiple thread IDs
   */
  async function fetchSyncStatuses(threadIds, provider) {
    if (!provider || threadIds.length === 0) return;

    // Build list of IDs to try (handle format variations)
    const idsToTry = [...new Set(threadIds)];

    // For Gemini, also try with/without c_ prefix
    if (provider === 'gemini') {
      for (const id of threadIds) {
        if (id.startsWith('c_')) {
          idsToTry.push(id.slice(2));
        } else if (!id.startsWith('c_')) {
          idsToTry.push('c_' + id);
        }
      }
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_BULK_SYNC_STATUS',
        provider,
        providerThreadIds: [...new Set(idsToTry)]
      });

      if (response?.statuses) {
        for (const [id, data] of Object.entries(response.statuses)) {
          // Map back to original ID format
          const originalId = threadIds.find(tid =>
            tid === id ||
            tid === id.replace(/^c_/, '') ||
            'c_' + tid === id ||
            tid === 'c_' + id
          );
          if (originalId) {
            syncStatusCache.set(originalId, data);
          }
          // Also cache with the returned ID
          syncStatusCache.set(id, data);
        }
      }
    } catch (err) {
      console.error('[ThreadHub] Bulk sync status fetch failed:', err);
    }
  }

  /**
   * Update all indicators in the sidebar
   */
  async function updateAllIndicators() {
    const provider = getProvider();
    if (!provider) return;

    const conversations = findConversationElements(provider);
    if (conversations.length === 0) return;

    // Collect thread IDs
    const threadIds = [];
    const elementMap = new Map(); // threadId -> element

    for (const el of conversations) {
      const threadId = extractThreadIdFromElement(el, provider);
      if (threadId) {
        threadIds.push(threadId);
        elementMap.set(threadId, el);
      }
    }

    // Fetch statuses
    await fetchSyncStatuses(threadIds, provider);

    // Update indicators
    for (const [threadId, el] of elementMap) {
      updateIndicator(el, threadId);
    }
  }

  /**
   * Debounced update
   */
  function scheduleUpdate() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updateAllIndicators, DEBOUNCE_MS);
  }

  /**
   * Initialize
   */
  function init() {
    const provider = getProvider();
    if (!provider) return;

    injectStyles();

    // Initial update (with delay for SPA to render)
    setTimeout(updateAllIndicators, 1500);

    // Periodic refresh
    checkInterval = setInterval(updateAllIndicators, CHECK_INTERVAL_MS);

    // Watch for DOM changes (new conversations, navigation)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          scheduleUpdate();
          break;
        }
      }
    });

    // Observe the whole document for changes
    observer.observe(document.body, { childList: true, subtree: true });

    if (typeof extLog === 'function') {
      extLog('content', 'info', 'Sync indicators initialized for ' + provider);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1000));
  } else {
    setTimeout(init, 1000);
  }

})();
