/**
 * Liberator Minimal Popup
 * Simple search and list interface
 */

let allThreads = [];
let filteredThreads = [];
let focusedIndex = -1;

const PROVIDER_LABELS = {
  chatgpt: 'GPT',
  claude: 'C',
  gemini: 'G',
  grok: 'X',
  copilot: 'CP',
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadThreads();
  setupSearch();
  setupKeyboard();
  setupFullViewButton();
});

async function loadThreads() {
  const listEl = document.getElementById('thread-list');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'LIST_THREADS',
      filters: {},
    });

    if (response?.error) throw new Error(response.error);

    allThreads = response?.threads || [];
    filteredThreads = [...allThreads];
    renderThreads();
  } catch (err) {
    console.error('[Popup] Failed to load threads:', err);
    listEl.innerHTML = `
      <div class="empty-state">
        <div>Failed to load</div>
        <div style="font-size: 11px; margin-top: 4px;">${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}

function renderThreads() {
  const listEl = document.getElementById('thread-list');

  if (filteredThreads.length === 0) {
    const query = document.getElementById('search').value;
    listEl.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <div>${query ? 'No results found' : 'No chats synced yet'}</div>
        <div style="font-size: 11px; margin-top: 4px;">
          ${query ? 'Try a different search' : 'Visit ChatGPT, Claude, or Gemini to sync'}
        </div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filteredThreads
    .slice(0, 50) // Limit for performance
    .map(
      (thread, i) => `
    <div class="thread-item ${i === focusedIndex ? 'focused' : ''}" data-index="${i}" data-id="${thread.id}">
      <div class="provider-icon ${thread.provider}">
        ${PROVIDER_LABELS[thread.provider] || '?'}
      </div>
      <div class="thread-content">
        <div class="thread-title">${escapeHtml(thread.title || 'Untitled')}</div>
        <div class="thread-meta">
          <span>${thread.message_count || 0} messages</span>
          <span>·</span>
          <span>${formatTime(thread.last_synced_at || thread.created_at)}</span>
        </div>
      </div>
    </div>
  `
    )
    .join('');

  // Add click handlers
  listEl.querySelectorAll('.thread-item').forEach((item) => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      openThread(id);
    });
  });
}

function setupSearch() {
  const searchEl = document.getElementById('search');

  searchEl.addEventListener('input', () => {
    const query = searchEl.value.toLowerCase().trim();

    if (!query) {
      filteredThreads = [...allThreads];
    } else {
      filteredThreads = allThreads.filter(
        (t) =>
          (t.title || '').toLowerCase().includes(query) || (t.summary || '').toLowerCase().includes(query)
      );
    }

    focusedIndex = filteredThreads.length > 0 ? 0 : -1;
    renderThreads();
  });
}

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (focusedIndex < filteredThreads.length - 1) {
        focusedIndex++;
        renderThreads();
        scrollToFocused();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (focusedIndex > 0) {
        focusedIndex--;
        renderThreads();
        scrollToFocused();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < filteredThreads.length) {
        openThread(filteredThreads[focusedIndex].id);
      }
    } else if (e.key === 'Escape') {
      const searchEl = document.getElementById('search');
      if (searchEl.value) {
        searchEl.value = '';
        filteredThreads = [...allThreads];
        focusedIndex = 0;
        renderThreads();
      }
    }
  });
}

function setupFullViewButton() {
  document.getElementById('open-full').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('ui/search.html') });
    window.close();
  });
}

function scrollToFocused() {
  const focused = document.querySelector('.thread-item.focused');
  if (focused) {
    focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function openThread(threadId) {
  const url = chrome.runtime.getURL(`ui/view.html?thread=${threadId}`);
  chrome.tabs.create({ url });
  window.close();
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
}
