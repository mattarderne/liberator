/**
 * Liberator Minimal Search Page
 * Full-page search with simple list view
 */

let allThreads = [];
let filteredThreads = [];
let selectedProvider = '';
let searchQuery = '';
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
  setupFilters();
  setupKeyboard();
});

async function loadThreads() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'LIST_THREADS',
      filters: {},
    });

    if (response?.error) throw new Error(response.error);

    allThreads = response?.threads || [];
    filteredThreads = [...allThreads];
    applyFiltersAndRender();
  } catch (err) {
    console.error('[Search] Failed to load threads:', err);
    document.getElementById('thread-list').innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <h3>Failed to load</h3>
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
    document.getElementById('stats').textContent = '';
  }
}

function applyFiltersAndRender() {
  let threads = [...allThreads];

  // Provider filter
  if (selectedProvider) {
    threads = threads.filter((t) => t.provider === selectedProvider);
  }

  // Search query
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    threads = threads.filter(
      (t) =>
        (t.title || '').toLowerCase().includes(query) ||
        (t.summary || '').toLowerCase().includes(query) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(query))
    );
  }

  filteredThreads = threads;
  focusedIndex = threads.length > 0 ? 0 : -1;
  renderThreads();
  updateStats();
}

function renderThreads() {
  const listEl = document.getElementById('thread-list');

  if (filteredThreads.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <h3>${searchQuery || selectedProvider ? 'No results found' : 'No conversations yet'}</h3>
        <p>${searchQuery || selectedProvider ? 'Try a different search or filter' : 'Visit ChatGPT, Claude, or Gemini to start syncing'}</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filteredThreads
    .map(
      (thread, i) => `
    <a class="thread-item ${i === focusedIndex ? 'focused' : ''}"
       data-index="${i}"
       data-id="${thread.id}"
       href="${chrome.runtime.getURL(`ui/view.html?thread=${thread.id}`)}">
      <div class="provider-icon ${thread.provider}">
        ${PROVIDER_LABELS[thread.provider] || '?'}
      </div>
      <div class="thread-content">
        <div class="thread-title">${escapeHtml(thread.title || 'Untitled')}</div>
        ${thread.summary ? `<div class="thread-summary">${escapeHtml(thread.summary)}</div>` : ''}
        <div class="thread-meta">
          <span>${thread.message_count || 0} messages</span>
          <span>·</span>
          <span>${formatDate(thread.last_synced_at || thread.created_at)}</span>
          ${thread.category ? `<span>·</span><span>${escapeHtml(thread.category)}</span>` : ''}
        </div>
        ${
          thread.tags && thread.tags.length > 0
            ? `
          <div class="thread-tags">
            ${thread.tags
              .slice(0, 3)
              .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
              .join('')}
          </div>
        `
            : ''
        }
      </div>
    </a>
  `
    )
    .join('');
}

function updateStats() {
  const statsEl = document.getElementById('stats');
  const total = allThreads.length;
  const shown = filteredThreads.length;

  if (searchQuery || selectedProvider) {
    statsEl.textContent = `Showing ${shown} of ${total} conversations`;
  } else {
    statsEl.textContent = `${total} conversations`;
  }
}

function setupSearch() {
  const searchEl = document.getElementById('search');

  searchEl.addEventListener('input', () => {
    searchQuery = searchEl.value.trim();
    applyFiltersAndRender();
  });
}

function setupFilters() {
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedProvider = btn.dataset.provider;
      applyFiltersAndRender();
    });
  });
}

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    const searchEl = document.getElementById('search');

    // Focus search on /
    if (e.key === '/' && document.activeElement !== searchEl) {
      e.preventDefault();
      searchEl.focus();
      return;
    }

    // Navigate with arrows
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
    } else if (e.key === 'Enter' && document.activeElement !== searchEl) {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < filteredThreads.length) {
        openThread(filteredThreads[focusedIndex].id);
      }
    } else if (e.key === 'Escape') {
      if (document.activeElement === searchEl) {
        searchEl.blur();
      } else if (searchQuery || selectedProvider) {
        searchEl.value = '';
        searchQuery = '';
        selectedProvider = '';
        document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        document.querySelector('.filter-btn[data-provider=""]').classList.add('active');
        applyFiltersAndRender();
      }
    }
  });
}

function scrollToFocused() {
  const focused = document.querySelector('.thread-item.focused');
  if (focused) {
    focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function openThread(threadId) {
  window.location.href = chrome.runtime.getURL(`ui/view.html?thread=${threadId}`);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
}
