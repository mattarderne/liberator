/**
 * AI Thread Hub - Standalone View
 * Keyboard-driven thread browser with multiple view modes
 */

// ============================================================
// Icon System - Lucide SVGs with emoji fallback
// ============================================================

let iconStyle = 'lucide'; // 'emoji' or 'lucide'

async function loadIconStyle() {
  return new Promise((resolve) => {
    chrome.storage.local.get('iconStyle', (result) => {
      iconStyle = result.iconStyle || 'lucide';
      resolve(iconStyle);
    });
  });
}

// Lucide SVG icons (inline for reliability)
const LUCIDE_SVGS = {
  code: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
  doc: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>',
  html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>',
  image: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
  data: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"></path><path d="M18 17V9"></path><path d="M13 17V5"></path><path d="M8 17v-3"></path></svg>',
  attachment: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>',
  user: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
  bot: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>',
  sparkles: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path><path d="M5 3v4"></path><path d="M19 17v4"></path><path d="M3 5h4"></path><path d="M17 19h4"></path></svg>',
  zap: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
  heart: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>',
  brain: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"></path><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"></path></svg>',
  folder: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
};

const EMOJI_ICONS = {
  code: '{ }',
  doc: '📄',
  html: '🌐',
  image: '🖼',
  data: '📊',
  attachment: '📎',
  user: '👤',
  bot: '🤖',
  sparkles: '✨',
  zap: '⚡',
  heart: '🧡',
  brain: '🔮',
  folder: '📁',
};

const PROVIDER_ICON_MAP = {
  chatgpt: 'bot',
  claude: 'heart',
  gemini: 'sparkles',
  grok: 'brain',
  copilot: 'zap',
};

// ============================================================
// Tag Color System - Consistent colors based on tag name hash
// ============================================================

// Predefined tag color palette (elegant, muted gradients)
const TAG_COLOR_PALETTE = [
  { bg: 'linear-gradient(135deg, #2d5a4d 0%, #1d4a3d 100%)', color: '#a8e6cf' }, // Teal/mint
  { bg: 'linear-gradient(135deg, #5a4d2d 0%, #4a3d1d 100%)', color: '#e6cfa8' }, // Amber/gold
  { bg: 'linear-gradient(135deg, #4d2d5a 0%, #3d1d4a 100%)', color: '#cfa8e6' }, // Purple/lavender
  { bg: 'linear-gradient(135deg, #2d4d5a 0%, #1d3d4a 100%)', color: '#a8cfe6' }, // Blue/sky
  { bg: 'linear-gradient(135deg, #5a2d4d 0%, #4a1d3d 100%)', color: '#e6a8cf' }, // Pink/rose
  { bg: 'linear-gradient(135deg, #3d5a2d 0%, #2d4a1d 100%)', color: '#cfe6a8' }, // Green/lime
  { bg: 'linear-gradient(135deg, #5a3d2d 0%, #4a2d1d 100%)', color: '#e6b8a8' }, // Coral/peach
  { bg: 'linear-gradient(135deg, #2d3d5a 0%, #1d2d4a 100%)', color: '#a8b8e6' }, // Indigo/periwinkle
];

// Simple string hash function for consistent color assignment
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// Get consistent color for a tag based on its name
function getTagColor(tagName) {
  const index = hashString(tagName.toLowerCase()) % TAG_COLOR_PALETTE.length;
  return TAG_COLOR_PALETTE[index];
}

// Generate inline style for a tag
function getTagStyle(tagName) {
  const color = getTagColor(tagName);
  return `background: ${color.bg}; color: ${color.color};`;
}

function getIcon(name, options = {}) {
  if (iconStyle === 'lucide' && LUCIDE_SVGS[name]) {
    let svg = LUCIDE_SVGS[name];
    if (options.size) {
      svg = svg.replace(/width="\d+"/, `width="${options.size}"`).replace(/height="\d+"/, `height="${options.size}"`);
    }
    if (options.class) {
      svg = svg.replace('<svg ', `<svg class="${options.class}" `);
    }
    return svg;
  }
  return EMOJI_ICONS[name] || name;
}

// State
let allThreads = [];
let filteredThreads = [];
let selectedThreadId = null;
let selectedThreadMessages = [];
let linkedThreads = [];
let currentView = 'thread'; // thread, list, cards, kanban
let currentGroupBy = 'none'; // none, category, status, provider, priority

// Filter state
let selectedTags = new Set();
let allTags = new Map(); // tag -> count

// Table sort state for list view
let listSortColumn = 'last_synced_at';
let listSortDirection = 'desc';

// Link modal state
let linkModalOpen = false;

// Stats modal state
let statsModalOpen = false;

// Tag editor modal state
let tagEditorOpen = false;
let tagEditorTags = [];
let tagEditorSelectedIndex = -1;
let tagEditorInput = '';

// Project selector modal state
let projectSelectorOpen = false;
let projectSelectorSelectedIndex = 0;

// Project state
let allProjects = [];
let selectedProjectId = null;
let projectViewMode = false; // When true, show project view instead of threads

// Focus tracking
let focusedThreadIndex = -1;
let focusedMessageIndex = -1;
let focusMode = 'threads'; // threads, messages

// Undo stack for completed threads (last 5)
let completedUndoStack = []; // Array of { threadIds: [], previousStatuses: {} }
const MAX_UNDO_STACK = 5;

// Shortcuts modal state
let shortcutsModalOpen = false;

// Attachment filter state (for focus mode)
let activeAttachmentFilter = null; // 'code', 'doc', 'html', 'image', 'data', or null

// Validation modal state
let validationModalOpen = false;
let validationAuditRunning = false;

// ============================================================
// Initialization
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadIconStyle(); // Load icon preference first
  await loadProjects(); // Load projects first for filter dropdown
  await loadBlockedSimilarPairs(); // Load blocked similar thread pairs
  await loadThreads();
  setupEventListeners();
  setupKeyboardShortcuts();
  setupShortcutsModal();

  // Set initial view (hides irrelevant controls for thread view)
  setView(currentView);

  // Check for thread ID in URL
  const params = new URLSearchParams(window.location.search);
  const threadId = params.get('id');
  if (threadId) {
    selectThread(threadId);
  }
});

async function loadThreads() {
  try {
    const searchQuery = document.getElementById('sidebar-search').value.trim();
    const provider = document.getElementById('provider-filter').value;
    const filters = { provider: provider || undefined };

    let response;
    if (searchQuery) {
      response = await chrome.runtime.sendMessage({
        type: 'SEARCH_THREADS',
        query: searchQuery,
        filters,
      });
    } else {
      response = await chrome.runtime.sendMessage({
        type: 'LIST_THREADS',
        filters,
      });
    }
    allThreads = response?.threads || [];
    applyFiltersAndSort();
    renderCurrentView();
  } catch (err) {
    console.error('Failed to load threads:', err);
  }
}

// ============================================================
// Provider URL Builder
// ============================================================

function buildProviderUrl(provider, threadId, existingUrl) {
  // If we have an existing URL from scraping, prefer that
  if (existingUrl && existingUrl.startsWith('http')) {
    return existingUrl;
  }

  switch (provider) {
    case 'chatgpt':
      if (threadId.startsWith('codex-task-')) {
        return `https://chatgpt.com/codex/tasks/${threadId.replace('codex-task-', '')}`;
      }
      if (threadId.startsWith('codex-')) {
        return `https://chatgpt.com/codex/${threadId.replace('codex-', '')}`;
      }
      return `https://chatgpt.com/c/${threadId}`;
    case 'claude':
      if (threadId.startsWith('code-')) {
        return `https://claude.ai/code/${threadId.replace('code-', '')}`;
      }
      if (threadId.startsWith('project-')) {
        return `https://claude.ai/project/${threadId.replace('project-', '')}`;
      }
      return `https://claude.ai/chat/${threadId}`;
    case 'gemini':
      return `https://gemini.google.com/app/${threadId}`;
    case 'grok':
      return `https://grok.com/c/${threadId}`;
    case 'copilot':
      if (threadId.startsWith('m365-')) {
        return `https://m365.cloud.microsoft/chat?chatId=${threadId.replace('m365-', '')}`;
      }
      return `https://copilot.microsoft.com/chats/${threadId}`;
    default:
      return existingUrl || null;
  }
}

// ============================================================
// Project Functions
// ============================================================

async function loadProjects() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'LIST_PROJECTS' });
    allProjects = response?.projects || [];
    renderProjectsDropdown();
  } catch (err) {
    console.error('Failed to load projects:', err);
  }
}

function renderProjectsDropdown() {
  const container = document.getElementById('project-filter');
  if (!container) return;

  container.innerHTML = `
    <option value="">All Threads</option>
    ${allProjects.map(p => `
      <option value="${p.id}" ${selectedProjectId === p.id ? 'selected' : ''}>
        📁 ${escapeHtml(p.name)} (${p.thread_count || 0})
      </option>
    `).join('')}
  `;
}

async function filterByProject(projectId) {
  selectedProjectId = projectId;
  if (!projectId) {
    // Show all threads
    await loadThreads();
    return;
  }

  // Get threads for this project
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_PROJECT',
      projectId,
    });
    if (response?.success) {
      allThreads = response.threads || [];
      applyFiltersAndSort();
      renderCurrentView();
    }
  } catch (err) {
    console.error('Failed to load project threads:', err);
  }
}

async function getThreadProjectsList(threadId) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_THREAD_PROJECTS',
      threadId,
    });
    return response?.projects || [];
  } catch (err) {
    console.error('Failed to get thread projects:', err);
    return [];
  }
}

async function addThreadToProject(threadId, projectId) {
  try {
    await chrome.runtime.sendMessage({
      type: 'ADD_THREAD_TO_PROJECT',
      projectId,
      threadId,
    });
    await loadProjects(); // Refresh project counts
    return true;
  } catch (err) {
    console.error('Failed to add thread to project:', err);
    return false;
  }
}

async function removeThreadFromProject(threadId, projectId) {
  try {
    await chrome.runtime.sendMessage({
      type: 'REMOVE_THREAD_FROM_PROJECT',
      projectId,
      threadId,
    });
    await loadProjects(); // Refresh project counts
    return true;
  } catch (err) {
    console.error('Failed to remove thread from project:', err);
    return false;
  }
}

function applyFiltersAndSort() {
  const sortBy = document.getElementById('sort-filter').value;
  const categoryFilter = document.getElementById('category-filter').value;
  const statusFilter = document.getElementById('status-filter').value;

  // Build tag counts from all threads
  allTags.clear();
  allThreads.forEach(thread => {
    const tags = Array.isArray(thread.tags) ? thread.tags : [];
    tags.forEach(tag => {
      allTags.set(tag, (allTags.get(tag) || 0) + 1);
    });
  });

  // Apply filters
  filteredThreads = allThreads.filter(thread => {
    // Category filter
    if (categoryFilter && thread.category !== categoryFilter) return false;

    // Status filter (supports !value for "not equal")
    if (statusFilter) {
      if (statusFilter.startsWith('!')) {
        const excludeStatus = statusFilter.slice(1);
        if (thread.status === excludeStatus) return false;
      } else {
        if (thread.status !== statusFilter) return false;
      }
    }

    // Tag filter (thread must have ALL selected tags)
    if (selectedTags.size > 0) {
      const threadTags = new Set(Array.isArray(thread.tags) ? thread.tags : []);
      for (const tag of selectedTags) {
        if (!threadTags.has(tag)) return false;
      }
    }

    return true;
  });

  // Sort
  filteredThreads.sort((a, b) => {
    switch (sortBy) {
      case 'sync_desc':
        return new Date(b.last_synced_at || 0) - new Date(a.last_synced_at || 0);
      case 'sync_asc':
        return new Date(a.last_synced_at || 0) - new Date(b.last_synced_at || 0);
      case 'created_desc':
        return new Date(b.created_at || b.last_synced_at || 0) - new Date(a.created_at || a.last_synced_at || 0);
      case 'created_asc':
        return new Date(a.created_at || a.last_synced_at || 0) - new Date(b.created_at || b.last_synced_at || 0);
      case 'msgs_desc':
        return (b.message_count || b.messages?.length || 0) - (a.message_count || a.messages?.length || 0);
      case 'title_asc':
        return (a.title || '').localeCompare(b.title || '');
      case 'category_asc':
        return (a.category || 'zzz').localeCompare(b.category || 'zzz');
      case 'status_asc':
        return (a.status || 'zzz').localeCompare(b.status || 'zzz');
      default:
        return 0;
    }
  });

  // Update tag filter display
  renderTagsFilter();
}

function renderTagsFilter() {
  const container = document.getElementById('tags-filter-list');
  const countEl = document.getElementById('tags-filter-count');

  if (!container) return;

  // Sort tags by count descending
  const sortedTags = Array.from(allTags.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20); // Show top 20 tags

  countEl.textContent = sortedTags.length > 0 ? `(${sortedTags.length})` : '';

  container.innerHTML = '';

  sortedTags.forEach(([tag, count]) => {
    const el = document.createElement('span');
    el.className = 'tag-filter-item';
    if (selectedTags.has(tag)) el.classList.add('active');
    // Apply consistent color based on tag name
    const color = getTagColor(tag);
    el.style.background = color.bg;
    el.style.color = color.color;
    el.innerHTML = `${escapeHtml(tag)}<span class="count">${count}</span>`;
    el.addEventListener('click', () => toggleTagFilter(tag));
    container.appendChild(el);
  });
}

function toggleTagFilter(tag) {
  if (selectedTags.has(tag)) {
    selectedTags.delete(tag);
  } else {
    selectedTags.add(tag);
  }
  applyFiltersAndSort();
  renderCurrentView();
  updateClearFiltersState();
}

// Clear all filters and reset to defaults
function clearAllFilters() {
  // Reset search
  document.getElementById('sidebar-search').value = '';

  // Reset dropdowns to default values
  document.getElementById('provider-filter').value = '';
  document.getElementById('category-filter').value = '';
  document.getElementById('status-filter').value = '!complete'; // Default
  document.getElementById('project-filter').value = '';

  // Clear selected tags
  selectedTags.clear();
  selectedProjectId = null;

  // Re-apply and render
  loadThreads();
  updateClearFiltersState();
}

// Update the clear filters button state based on active filters
function updateClearFiltersState() {
  const hasFilters =
    document.getElementById('sidebar-search').value !== '' ||
    document.getElementById('provider-filter').value !== '' ||
    document.getElementById('category-filter').value !== '' ||
    document.getElementById('status-filter').value !== '!complete' ||
    document.getElementById('project-filter').value !== '' ||
    selectedTags.size > 0;

  const clearBtn = document.getElementById('clear-all-filters');
  clearBtn.classList.toggle('has-filters', hasFilters);

  // Show/hide tags clear button
  const clearTagsBtn = document.getElementById('clear-tags-filter');
  clearTagsBtn.style.display = selectedTags.size > 0 ? 'inline' : 'none';
}

// ============================================================
// Rendering
// ============================================================

function renderCurrentView() {
  renderThreadList();

  switch (currentView) {
    case 'thread':
      renderThreadView();
      break;
    case 'list':
      renderListView();
      break;
    case 'cards':
      renderCardsView();
      break;
    case 'kanban':
      renderKanbanView();
      break;
  }
}

function renderThreadList() {
  const container = document.getElementById('thread-list');
  container.innerHTML = '';

  if (filteredThreads.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No threads found</div>';
    return;
  }

  filteredThreads.forEach((thread, index) => {
    const el = document.createElement('div');
    el.className = 'thread-item';
    if (thread.id === selectedThreadId) el.classList.add('selected');
    if (index === focusedThreadIndex && focusMode === 'threads') el.classList.add('focused');
    el.dataset.threadId = thread.id;
    el.dataset.index = index;

    const msgCount = thread.message_count || thread.messages?.length || 0;
    const syncTime = formatRelativeTime(thread.last_synced_at);

    // Calculate sync freshness
    const syncStatus = getSyncStatus(thread.last_synced_at);

    // Show match snippet if searching
    const snippetHtml = thread.matchSnippet
      ? `<div class="thread-item-snippet">${escapeHtml(thread.matchSnippet)}</div>`
      : '';

    // Meta badges for repo/org
    let metaBadgesHtml = '';
    if (thread.github_repo) {
      metaBadgesHtml += `<span class="meta-badge repo" title="GitHub Repo">${escapeHtml(thread.github_repo)}</span>`;
    }
    if (thread.organization) {
      metaBadgesHtml += `<span class="meta-badge org" title="Organization">${escapeHtml(thread.organization)}</span>`;
    }

    // Attachment type badges
    const attachmentBadges = getAttachmentBadgesHtml(thread.attachment_types);

    // Status badge for sidebar
    const status = thread.status || 'in_progress';
    const statusLabel = status.replace('_', ' ');

    el.innerHTML = `
      <div class="thread-item-title">${escapeHtml(thread.title || 'Untitled')}</div>
      ${snippetHtml}
      ${metaBadgesHtml ? `<div class="thread-item-badges">${metaBadgesHtml}</div>` : ''}
      <div class="thread-item-meta">
        <span class="status-badge status-${status}">${statusLabel}</span>
        <span class="thread-item-source">${thread.provider}</span>
        <span>${msgCount} msgs</span>
        <span>${syncTime}</span>
        ${attachmentBadges ? `<span class="thread-item-attachments">${attachmentBadges}</span>` : ''}
      </div>
    `;

    el.addEventListener('click', () => {
      focusedThreadIndex = index;
      focusMode = 'threads';
      updateFocus();
      selectThread(thread.id);
    });

    container.appendChild(el);
  });
}

function renderThreadView() {
  if (!selectedThreadId) return;

  const thread = allThreads.find(t => t.id === selectedThreadId);
  if (!thread) return;

  const container = document.getElementById('thread-content');

  // Build flags HTML
  const flags = [];
  if (thread.contains_pii) flags.push('PII');
  if (thread.contains_security_or_secrets) flags.push('Secrets');
  if (thread.contains_customer_sensitive) flags.push('Customer');
  if (thread.contains_legal_sensitive) flags.push('Legal');

  const flagsHtml = flags.length
    ? `<div class="thread-flags">${flags.map(f => `<span class="thread-flag">${f}</span>`).join('')}</div>`
    : '';

  const syncTime = formatRelativeTime(thread.last_synced_at);
  const createdTime = thread.created_at ? formatRelativeTime(thread.created_at) : null;
  const summary = thread.ai_summary || thread.provider_summary || '';

  // Meta badges for repo/org
  let metaBadgesHtml = '';
  if (thread.github_repo) {
    metaBadgesHtml += `<span class="meta-badge repo" title="GitHub Repo">${escapeHtml(thread.github_repo)}</span>`;
  }
  if (thread.organization) {
    metaBadgesHtml += `<span class="meta-badge org" title="Organization">${escapeHtml(thread.organization)}</span>`;
  }

  // Status badge
  const statusBadge = thread.status
    ? `<span class="status-badge status-${thread.status}">${thread.status.replace('_', ' ')}</span>`
    : '';

  // Priority badge
  const priorityBadge = thread.priority
    ? `<span class="priority-badge priority-${thread.priority}">${thread.priority}</span>`
    : '';

  // Category badge
  const categoryBadge = thread.category
    ? `<span class="category-badge">${thread.category}</span>`
    : '';

  // Tags (with consistent hash-based colors)
  const tags = Array.isArray(thread.tags) ? thread.tags : [];
  const tagsHtml = tags.length
    ? `<div class="tags-container">${tags.map(t => `<span class="tag" style="${getTagStyle(t)}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  // Attachment type badges (clickable for focus mode)
  const attachmentTypesHtml = thread.attachment_types?.length
    ? `<div class="thread-attachments-section" style="margin-top: 8px;">
        <span style="font-size: 11px; color: var(--text-muted); margin-right: 6px;">Attachments:</span>
        ${getAttachmentBadgesHtml(thread.attachment_types)}
        <button class="clear-attachment-filter" id="clear-attachment-filter" style="display: none; margin-left: 8px; font-size: 11px; padding: 2px 6px; border-radius: 4px; background: var(--bg-tertiary); border: none; color: var(--text-secondary); cursor: pointer;">Clear filter</button>
      </div>`
    : '';

  // Build detailed metadata for expandable section
  const hasMetadata = thread.outcome_prediction || thread.progress_stage || thread.suggested_next_step || flags.length > 0;

  const metaDetailsHtml = hasMetadata ? `
    <button class="meta-expand-toggle" id="meta-toggle">
      <span class="arrow">▼</span>
      <span>Show details</span>
    </button>
    <div class="meta-details" id="meta-details">
      ${thread.progress_stage ? `
        <div class="meta-details-row">
          <span class="meta-label">Stage:</span>
          <span class="meta-value">${escapeHtml(thread.progress_stage)}</span>
        </div>
      ` : ''}
      ${thread.outcome_prediction ? `
        <div class="meta-details-row">
          <span class="meta-label">Outcome:</span>
          <span class="meta-value">${escapeHtml(thread.outcome_prediction)}</span>
        </div>
      ` : ''}
      ${thread.suggested_next_step ? `
        <div class="meta-details-row">
          <span class="meta-label">Next step:</span>
          <span class="meta-value">${escapeHtml(thread.suggested_next_step)}</span>
        </div>
      ` : ''}
      ${flags.length ? `
        <div class="meta-details-row">
          <span class="meta-label">Flags:</span>
          <span class="meta-value">${flags.join(', ')}</span>
        </div>
      ` : ''}
    </div>
  ` : '';

  // Build provider URL for "Open in X" link
  const providerUrl = buildProviderUrl(thread.provider, thread.provider_thread_id || thread.id, thread.url);
  const openLinkHtml = providerUrl
    ? `<a href="${providerUrl}" target="_blank" class="open-provider-link" title="Open in ${thread.provider}">Open ↗</a>`
    : '';

  // Projects for title row
  const projectsInlineHtml = renderThreadProjectsInline();

  container.innerHTML = `
    <div class="thread-meta-header">
      <div class="thread-title-row">
        <h2 class="editable-title" title="Click to edit">${escapeHtml(thread.title || 'Untitled')}</h2>
        <input type="text" class="title-edit-input" value="${escapeHtml(thread.title || '')}" style="display: none;" />
        <div class="thread-title-actions">
          ${projectsInlineHtml}
          ${openLinkHtml}
        </div>
      </div>
      <div class="thread-meta-row">
        ${statusBadge ? `<span class="thread-meta-item">${statusBadge}</span>` : ''}
        ${priorityBadge ? `<span class="thread-meta-item">${priorityBadge}</span>` : ''}
        ${categoryBadge ? `<span class="thread-meta-item">${categoryBadge}</span>` : ''}
        <span class="thread-meta-item">${thread.provider}</span>
        <span class="thread-meta-item">${selectedThreadMessages.length} messages</span>
        ${createdTime ? `<span class="thread-meta-item">Created ${createdTime}</span>` : ''}
      </div>
      ${metaBadgesHtml ? `<div class="thread-item-badges" style="margin-top: 8px;">${metaBadgesHtml}</div>` : ''}
      ${tagsHtml}
      ${attachmentTypesHtml}
      ${summary ? `<div style="margin-top: 8px; font-size: 13px; color: var(--text-secondary);">${escapeHtml(summary)}</div>` : ''}
      ${metaDetailsHtml}
      ${renderPIISection(thread)}
      ${renderLinkedThreadsSection()}
      ${renderSimilarThreadsSection()}
    </div>
    <div class="messages-container" id="messages-container"></div>
  `;

  // Setup metadata toggle
  const metaToggle = document.getElementById('meta-toggle');
  const metaDetails = document.getElementById('meta-details');
  if (metaToggle && metaDetails) {
    metaToggle.addEventListener('click', () => {
      metaToggle.classList.toggle('expanded');
      metaDetails.classList.toggle('expanded');
      metaToggle.querySelector('span:last-child').textContent =
        metaDetails.classList.contains('expanded') ? 'Hide details' : 'Show details';
    });
  }

  renderMessages();
  setupLinkedThreadsListeners();
  setupPIISectionListeners();
  setupSimilarThreadsListeners();
  setupTitleEditListener();
  setupAttachmentFilterListeners();
  setupClickToFilterListeners();
}

// Setup click-to-filter and double-click-to-edit on tags, status, priority, category badges
function setupClickToFilterListeners() {
  const container = document.getElementById('thread-content');
  if (!container) return;

  // Click on tags to filter sidebar, double-click to open tag editor
  container.querySelectorAll('.tag[data-tag]').forEach(el => {
    el.classList.add('clickable-badge');
    el.title = 'Click: filter | Double-click: edit tags';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const tag = el.dataset.tag;
      toggleTagFilter(tag);
      renderCurrentView(); // Re-render sidebar without changing view
    });
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      openTagEditorModal();
    });
  });

  // Click on status badge to filter sidebar, double-click to change status
  container.querySelectorAll('.status-badge').forEach(el => {
    el.classList.add('clickable-badge');
    el.title = 'Click: filter | Double-click: change status';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const status = el.textContent.replace(' ', '_');
      document.getElementById('status-filter').value = status;
      applyFiltersAndSort();
      renderCurrentView();
    });
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      showInlineStatusEditor(el);
    });
  });

  // Double-click on priority badge to change priority
  container.querySelectorAll('.priority-badge').forEach(el => {
    el.classList.add('clickable-badge');
    el.title = 'Double-click to change priority';
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      showInlinePriorityEditor(el);
    });
  });

  // Click on category badge to filter sidebar, double-click to change category
  container.querySelectorAll('.category-badge').forEach(el => {
    el.classList.add('clickable-badge');
    el.title = 'Click: filter | Double-click: change category';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const category = el.textContent;
      document.getElementById('category-filter').value = category;
      applyFiltersAndSort();
      renderCurrentView();
    });
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      showInlineCategoryEditor(el);
    });
  });

  // Click on projects to filter sidebar by project
  container.querySelectorAll('.thread-project-inline').forEach(el => {
    el.classList.add('clickable-badge');
    el.title = 'Click to filter by this project';
    el.addEventListener('click', (e) => {
      // Don't filter if clicking the remove button
      if (e.target.classList.contains('thread-project-remove-inline')) return;
      e.stopPropagation();
      const projectId = el.dataset.projectId;
      if (projectId) {
        document.getElementById('project-filter').value = projectId;
        filterByProject(projectId);
        // Don't switch view, just filter sidebar
      }
    });
  });
}

// Inline editor for status
function showInlineStatusEditor(el) {
  const statuses = ['unknown', 'active', 'in_progress', 'needs_followup', 'waiting', 'resolved', 'abandoned'];
  const thread = allThreads.find(t => t.id === selectedThreadId);
  if (!thread) return;

  const select = document.createElement('select');
  select.className = 'inline-editor-select';
  select.innerHTML = statuses.map(s =>
    `<option value="${s}" ${thread.status === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`
  ).join('');

  select.style.cssText = 'font-size: 11px; padding: 2px 4px; border-radius: 4px; border: 1px solid var(--accent);';
  el.replaceWith(select);
  select.focus();

  const handleChange = async () => {
    const newStatus = select.value;
    await updateThreadStatus(selectedThreadId, newStatus);
    await selectThread(selectedThreadId); // Re-render
  };

  select.addEventListener('change', handleChange);
  select.addEventListener('blur', () => {
    // Revert if not changed
    selectThread(selectedThreadId);
  });
  select.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      selectThread(selectedThreadId);
    }
  });
}

// Inline editor for priority
function showInlinePriorityEditor(el) {
  const priorities = ['low', 'medium', 'high', 'urgent'];
  const thread = allThreads.find(t => t.id === selectedThreadId);
  if (!thread) return;

  const select = document.createElement('select');
  select.className = 'inline-editor-select';
  select.innerHTML = priorities.map(p =>
    `<option value="${p}" ${thread.priority === p ? 'selected' : ''}>${p}</option>`
  ).join('');

  select.style.cssText = 'font-size: 11px; padding: 2px 4px; border-radius: 4px; border: 1px solid var(--accent);';
  el.replaceWith(select);
  select.focus();

  const handleChange = async () => {
    const newPriority = select.value;
    await updateThreadPriority(selectedThreadId, newPriority);
    await selectThread(selectedThreadId);
  };

  select.addEventListener('change', handleChange);
  select.addEventListener('blur', () => selectThread(selectedThreadId));
  select.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') selectThread(selectedThreadId);
  });
}

// Inline editor for category
function showInlineCategoryEditor(el) {
  const categories = ['work', 'personal', 'home', 'hobbies', 'shopping', 'health', 'finance', 'other'];
  const thread = allThreads.find(t => t.id === selectedThreadId);
  if (!thread) return;

  const select = document.createElement('select');
  select.className = 'inline-editor-select';
  select.innerHTML = categories.map(c =>
    `<option value="${c}" ${thread.category === c ? 'selected' : ''}>${c}</option>`
  ).join('');

  select.style.cssText = 'font-size: 11px; padding: 2px 4px; border-radius: 4px; border: 1px solid var(--accent);';
  el.replaceWith(select);
  select.focus();

  const handleChange = async () => {
    const newCategory = select.value;
    await updateThreadCategory(selectedThreadId, newCategory);
    await selectThread(selectedThreadId);
  };

  select.addEventListener('change', handleChange);
  select.addEventListener('blur', () => selectThread(selectedThreadId));
  select.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') selectThread(selectedThreadId);
  });
}

// Update thread priority
async function updateThreadPriority(threadId, newPriority) {
  try {
    await chrome.runtime.sendMessage({
      type: 'UPDATE_THREAD_PRIORITY',
      threadId,
      priority: newPriority,
    });
    const thread = allThreads.find(t => t.id === threadId);
    if (thread) thread.priority = newPriority;
  } catch (err) {
    console.error('Failed to update priority:', err);
  }
}

// Update thread category
async function updateThreadCategory(threadId, newCategory) {
  try {
    await chrome.runtime.sendMessage({
      type: 'UPDATE_THREAD_CATEGORY',
      threadId,
      category: newCategory,
    });
    const thread = allThreads.find(t => t.id === threadId);
    if (thread) thread.category = newCategory;
  } catch (err) {
    console.error('Failed to update category:', err);
  }
}

function renderMessages() {
  const container = document.getElementById('messages-container');
  if (!container) return;

  container.innerHTML = '';

  // Get current thread for provider info
  const currentThread = allThreads.find(t => t.id === selectedThreadId);
  const providerName = getProviderDisplayName(currentThread?.provider);

  selectedThreadMessages.forEach((msg, index) => {
    const el = document.createElement('div');
    el.className = `message ${msg.role}`;
    if (index === focusedMessageIndex && focusMode === 'messages') el.classList.add('focused');
    el.dataset.index = index;

    // Check if message matches attachment filter
    const matchesFilter = !activeAttachmentFilter || messageMatchesAttachmentType(msg.text, activeAttachmentFilter);

    // Add filter-related classes
    if (activeAttachmentFilter) {
      if (matchesFilter) {
        el.classList.add('attachment-match');
        el.classList.add('expanded'); // Auto-expand matching messages
      } else {
        el.classList.add('attachment-dimmed');
      }
    }

    const roleLabel = msg.role === 'user' ? 'You' : providerName;
    const avatar = msg.role === 'user' ? getIcon('user', { size: 16 }) : getProviderAvatar(currentThread?.provider);

    // Process message text for code blocks
    const processedText = processMessageText(msg.text || '');

    // Create preview (first 2 lines, max 150 chars)
    const previewText = getMessagePreview(msg.text || '', 2, 150);

    // Detect attachment types for this message
    const msgAttachmentTypes = detectMessageAttachmentTypes(msg.text || '');
    const msgBadgesHtml = getMessageAttachmentBadgesHtml(msgAttachmentTypes, currentThread?.url);

    el.innerHTML = `
      <div class="message-header">
        <div class="message-avatar">${avatar}</div>
        <div class="message-role">${roleLabel}</div>
        ${msgBadgesHtml ? `<div class="message-attachments">${msgBadgesHtml}</div>` : ''}
        <div class="message-preview">${escapeHtml(previewText)}</div>
        <span class="message-toggle">▼</span>
      </div>
      <div class="message-body">${processedText}</div>
    `;

    // Toggle on header click
    el.querySelector('.message-header').addEventListener('click', () => {
      focusedMessageIndex = index;
      focusMode = 'messages';
      updateFocus();
      toggleMessage(el);
    });

    container.appendChild(el);
  });
}

function getMessagePreview(text, maxLines = 2, maxChars = 150) {
  if (!text) return '';
  // Get first N lines
  const lines = text.split('\n').filter(l => l.trim()).slice(0, maxLines);
  let preview = lines.join(' ').trim();
  // Truncate if too long
  if (preview.length > maxChars) {
    preview = preview.slice(0, maxChars - 3) + '...';
  }
  return preview;
}

let threadProjects = []; // Projects the current thread belongs to
let similarThreads = []; // Similar threads based on TF-IDF
let similarSearchPerformed = false; // Track if we've searched for similar threads
let blockedSimilarPairs = new Set(); // Blocked thread pairs (stored as "id1:id2")

/**
 * Load blocked similar thread pairs from storage
 */
async function loadBlockedSimilarPairs() {
  try {
    const stored = await chrome.storage.local.get('blockedSimilarPairs');
    const pairs = stored.blockedSimilarPairs || [];
    blockedSimilarPairs = new Set(pairs);
    console.log('[SimilarThreads] Loaded', blockedSimilarPairs.size, 'blocked pairs');
  } catch (err) {
    console.warn('Failed to load blocked pairs:', err);
    blockedSimilarPairs = new Set();
  }
}

/**
 * Render PII warning section with detected sensitive data
 */
function renderPIISection(thread) {
  if (!thread.pii_detections || thread.pii_detections.length === 0) {
    return '';
  }

  const summary = thread.pii_summary || { bySeverity: {}, total: 0 };
  const criticalCount = summary.bySeverity?.critical || 0;
  const highCount = summary.bySeverity?.high || 0;
  const mediumCount = summary.bySeverity?.medium || 0;

  // Determine severity class for styling
  let severityClass = 'pii-medium';
  if (criticalCount > 0) {
    severityClass = 'pii-critical';
  } else if (highCount > 0) {
    severityClass = 'pii-high';
  }

  // Build severity badges
  const badges = [];
  if (criticalCount > 0) badges.push(`<span class="pii-severity-badge critical">${criticalCount} Critical</span>`);
  if (highCount > 0) badges.push(`<span class="pii-severity-badge high">${highCount} High</span>`);
  if (mediumCount > 0) badges.push(`<span class="pii-severity-badge medium">${mediumCount} Medium</span>`);

  // Build detection list
  const detectionsList = thread.pii_detections.map(d => `
    <div class="pii-item severity-${d.severity}">
      <span class="pii-type">${escapeHtml(d.label)}</span>
      <span class="pii-value">${escapeHtml(d.value)}</span>
    </div>
  `).join('');

  return `
    <div class="pii-section ${severityClass}" id="pii-section">
      <div class="pii-header" id="pii-toggle">
        <span class="pii-icon">⚠️</span>
        <span class="pii-title">Sensitive Data Detected</span>
        <span class="pii-count">${thread.pii_detections.length} item${thread.pii_detections.length !== 1 ? 's' : ''}</span>
        <div class="pii-badges">${badges.join('')}</div>
        <span class="pii-arrow">▼</span>
      </div>
      <div class="pii-details" id="pii-details">
        <div class="pii-list">
          ${detectionsList}
        </div>
        <div class="pii-footer">
          <span class="pii-scanned">Scanned ${thread.pii_scanned_at ? formatRelativeTime(thread.pii_scanned_at) : 'recently'}</span>
        </div>
      </div>
    </div>
  `;
}

function setupPIISectionListeners() {
  const toggle = document.getElementById('pii-toggle');
  const details = document.getElementById('pii-details');
  const arrow = document.querySelector('.pii-arrow');

  if (toggle && details) {
    toggle.addEventListener('click', () => {
      details.classList.toggle('expanded');
      if (arrow) {
        arrow.textContent = details.classList.contains('expanded') ? '▲' : '▼';
      }
    });
  }
}

function renderThreadProjectsSection() {
  if (!selectedThreadId) return '';
  if (threadProjects.length === 0 && allProjects.length === 0) return '';

  // Dropdown to assign to project
  const assignOptions = allProjects
    .filter(p => !threadProjects.find(tp => tp.id === p.id))
    .map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join('');

  const projectsHtml = threadProjects.map(p => `
    <span class="thread-project-tag" data-project-id="${p.id}">
      📁 ${escapeHtml(p.name)}
      <button class="thread-project-remove" title="Remove from project">×</button>
    </span>
  `).join('');

  return `
    <div class="thread-projects-section">
      <span class="thread-projects-label">Projects:</span>
      ${projectsHtml}
      ${assignOptions ? `
        <select class="thread-project-add" id="add-to-project">
          <option value="">+ Add to project</option>
          ${assignOptions}
        </select>
      ` : ''}
    </div>
  `;
}

function renderThreadProjectsInline() {
  if (!selectedThreadId) return '';

  // Dropdown to assign to project
  const assignOptions = allProjects
    .filter(p => !threadProjects.find(tp => tp.id === p.id))
    .map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join('');

  const projectsHtml = threadProjects.map(p => `
    <span class="thread-project-inline" data-project-id="${p.id}">
      ${getIcon('folder', { size: 12 })} ${escapeHtml(p.name)}
      <button class="thread-project-remove-inline" title="Remove">×</button>
    </span>
  `).join('');

  return `
    <div class="thread-projects-inline">
      ${projectsHtml}
      ${assignOptions ? `
        <select class="thread-project-add-inline" id="add-to-project">
          <option value="">+ Project</option>
          ${assignOptions}
        </select>
      ` : ''}
    </div>
  `;
}

function renderLinkedThreadsSection() {
  if (!selectedThreadId) return '';

  // If no linked threads, just show the link button inline
  if (linkedThreads.length === 0) {
    return `
      <div class="linked-threads-section" style="border-top: none; margin-top: 8px; padding-top: 0;">
        <button class="link-add-btn" id="open-link-modal">🔗 Link Thread</button>
      </div>
    `;
  }

  const linkedHtml = linkedThreads.map(t => {
    const msgCount = t.message_count || t.messages?.length || 0;
    const lastSync = t.last_synced_at ? formatRelativeTime(new Date(t.last_synced_at)) : '';
    const preview = getThreadPreview(t);
    const tags = t.tags?.length ? t.tags.slice(0, 3) : [];
    const tagsHtml = tags.map(tag => `<span class="mini-tag">${escapeHtml(tag)}</span>`).join('');
    const status = t.status || 'in_progress';
    return `
      <div class="linked-thread-item" data-thread-id="${t.id}">
        <span class="thread-item-provider provider-${t.provider}">${t.provider}</span>
        <span class="status-badge status-${status}">${status.replace('_', ' ')}</span>
        <div class="linked-thread-info">
          <span class="linked-thread-title">${escapeHtml(t.title || 'Untitled')}</span>
          <span class="linked-thread-meta">${msgCount} msgs${lastSync ? ' · ' + lastSync : ''}</span>
          ${tags.length ? `<div class="linked-thread-tags">${tagsHtml}</div>` : ''}
        </div>
        <button class="linked-thread-expand" data-thread-id="${t.id}" title="Preview">▼</button>
        <button class="unlink-btn" data-thread-id="${t.id}" title="Unlink">×</button>
      </div>
      <div class="linked-thread-preview" data-thread-id="${t.id}" style="display: none;">
        <div class="preview-content">${escapeHtml(preview)}</div>
        <button class="preview-goto" data-thread-id="${t.id}">Open Thread →</button>
      </div>
    `;
  }).join('');

  return `
    <div class="linked-threads-section">
      <div class="linked-threads-header">
        <button class="link-add-btn" id="open-link-modal">+ Link</button>
        <span class="linked-threads-label">🔗 Linked Threads</span>
      </div>
      <div class="linked-threads-list">
        ${linkedHtml}
      </div>
    </div>
  `;
}

function setupLinkedThreadsListeners() {
  // Open link modal button
  const openBtn = document.getElementById('open-link-modal');
  if (openBtn) {
    openBtn.addEventListener('click', openLinkModal);
  }

  // Unlink buttons
  document.querySelectorAll('.unlink-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const threadId = btn.dataset.threadId;
      await unlinkThread(threadId);
    });
  });

  // Expand/collapse preview buttons
  document.querySelectorAll('.linked-thread-expand').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const threadId = btn.dataset.threadId;
      const preview = document.querySelector(`.linked-thread-preview[data-thread-id="${threadId}"]`);
      if (preview) {
        const isHidden = preview.style.display === 'none';
        preview.style.display = isHidden ? 'block' : 'none';
        btn.textContent = isHidden ? '▲' : '▼';
      }
    });
  });

  // Go to thread buttons in preview
  document.querySelectorAll('.preview-goto').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const threadId = btn.dataset.threadId;
      selectThread(threadId);
    });
  });

  // Click on linked thread title to toggle preview
  document.querySelectorAll('.linked-thread-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('unlink-btn') || e.target.classList.contains('linked-thread-expand')) return;
      const threadId = item.dataset.threadId;
      const preview = document.querySelector(`.linked-thread-preview[data-thread-id="${threadId}"]`);
      const expandBtn = item.querySelector('.linked-thread-expand');
      if (preview) {
        const isHidden = preview.style.display === 'none';
        preview.style.display = isHidden ? 'block' : 'none';
        if (expandBtn) expandBtn.textContent = isHidden ? '▲' : '▼';
      }
    });
  });

  // Setup project listeners
  setupProjectListeners();
}

function setupProjectListeners() {
  // Add to project dropdown
  const addDropdown = document.getElementById('add-to-project');
  if (addDropdown) {
    addDropdown.addEventListener('change', async (e) => {
      const projectId = e.target.value;
      if (projectId && selectedThreadId) {
        await addThreadToProject(selectedThreadId, projectId);
        // Reload thread projects and re-render
        const response = await chrome.runtime.sendMessage({
          type: 'GET_THREAD_PROJECTS',
          threadId: selectedThreadId,
        });
        threadProjects = response?.projects || [];
        renderThreadView();
      }
    });
  }

  // Remove from project buttons
  document.querySelectorAll('.thread-project-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const projectTag = btn.closest('.thread-project-tag');
      const projectId = projectTag?.dataset.projectId;
      if (projectId && selectedThreadId) {
        await removeThreadFromProject(selectedThreadId, projectId);
        // Reload thread projects and re-render
        const response = await chrome.runtime.sendMessage({
          type: 'GET_THREAD_PROJECTS',
          threadId: selectedThreadId,
        });
        threadProjects = response?.projects || [];
        renderThreadView();
      }
    });
  });
}

/**
 * Load similar threads for the current thread
 */
async function loadSimilarThreads() {
  if (!selectedThreadId) {
    similarThreads = [];
    similarSearchPerformed = false;
    return;
  }

  try {
    console.log('[SimilarThreads] Requesting similar for:', selectedThreadId);
    const response = await chrome.runtime.sendMessage({
      type: 'GET_SIMILAR_THREADS',
      threadId: selectedThreadId,
      topK: 10 // Request more since we filter out linked/blocked
    });
    console.log('[SimilarThreads] Response:', response);

    similarSearchPerformed = true;
    if (response?.success && response.similar) {
      similarThreads = response.similar;
      console.log('[SimilarThreads] Found:', similarThreads.length, 'similar threads');
    } else {
      console.log('[SimilarThreads] No results, response:', response);
      similarThreads = [];
    }
  } catch (err) {
    console.warn('Failed to load similar threads:', err);
    similarThreads = [];
  }
}

/**
 * Render similar threads section
 */
function renderSimilarThreadsSection() {
  if (!selectedThreadId) return '';

  // Get IDs of already linked threads
  const linkedIds = new Set(linkedThreads.map(t => t.id));

  // Filter out linked threads and blocked pairs from display
  const filteredSimilar = similarThreads.filter(({ thread }) => {
    // Don't show already linked threads
    if (linkedIds.has(thread.id)) return false;
    // Don't show blocked pairs
    if (blockedSimilarPairs.has(`${selectedThreadId}:${thread.id}`) ||
        blockedSimilarPairs.has(`${thread.id}:${selectedThreadId}`)) return false;
    return true;
  });

  // If no similar threads to show, display empty state with Find button
  if (filteredSimilar.length === 0) {
    return `
      <div class="similar-threads-section">
        <div class="similar-threads-header">
          <span class="similar-threads-label">Similar Threads</span>
        </div>
        <div class="similar-threads-empty">
          <button class="find-similar-btn" id="find-similar-btn">${similarSearchPerformed ? 'Search Again' : 'Find Similar'}</button>
          ${similarSearchPerformed ? '<span class="no-results-text">No unlinked similar threads</span>' : ''}
        </div>
      </div>
    `;
  }

  const similarHtml = filteredSimilar.map(({ thread, score, matchType }) => {
    const percentage = Math.round(score * 100);
    const preview = getThreadPreview(thread, 150);
    const tags = thread.tags?.length ? thread.tags.slice(0, 3) : [];
    const tagsHtml = tags.map(tag => `<span class="mini-tag">${escapeHtml(tag)}</span>`).join('');
    const status = thread.status || 'in_progress';
    // Show match type indicator - embedding is semantic/best, tfidf is keyword-based
    const matchTypeLabel = matchType === 'embedding' ? 'semantic'
      : matchType === 'tfidf' ? 'keywords'
      : matchType === 'tags' ? 'tags'
      : matchType;
    const matchTypeClass = matchType === 'embedding' ? 'match-semantic' : 'match-keywords';
    return `
      <div class="similar-thread-card" data-thread-id="${thread.id}">
        <div class="similar-thread-header">
          <span class="similarity-score">${percentage}%</span>
          <span class="match-type-badge ${matchTypeClass}" title="Matched by ${matchTypeLabel}">${matchTypeLabel}</span>
          <span class="thread-item-provider provider-${thread.provider}">${thread.provider}</span>
          <span class="status-badge status-${status}">${status.replace('_', ' ')}</span>
          <span class="similar-thread-title">${escapeHtml(thread.title || 'Untitled')}</span>
          <div class="similar-actions-group">
            <button class="link-similar-btn" data-thread-id="${thread.id}" title="Link this thread">Link</button>
            <button class="block-similar-btn" data-thread-id="${thread.id}" title="Don't show this match">No</button>
          </div>
        </div>
        ${tags.length ? `<div class="similar-thread-tags">${tagsHtml}</div>` : ''}
        <div class="similar-thread-preview">${escapeHtml(preview)}</div>
      </div>
    `;
  }).join('');

  // Show "Link All" button if more than 3 results
  const showLinkAll = filteredSimilar.length > 3;

  return `
    <div class="similar-threads-section">
      <div class="similar-threads-header">
        <span class="similar-threads-label">Similar Threads</span>
        <div class="similar-threads-actions">
          ${showLinkAll ? `<button class="link-all-btn" id="link-all-similar" title="Link all ${filteredSimilar.length} threads">Link All</button>` : ''}
          <button class="refresh-similar-btn" id="refresh-similar" title="Refresh similar threads">Refresh</button>
        </div>
      </div>
      <div class="similar-threads-list">
        ${similarHtml}
      </div>
    </div>
  `;
}

/**
 * Setup similar threads section listeners
 */
function setupSimilarThreadsListeners() {
  // Find Similar button (in empty state)
  const findBtn = document.getElementById('find-similar-btn');
  if (findBtn) {
    findBtn.addEventListener('click', async () => {
      findBtn.textContent = '...';
      findBtn.disabled = true;
      await loadSimilarThreads();
      renderThreadView();
    });
  }

  // Refresh button
  const refreshBtn = document.getElementById('refresh-similar');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.textContent = '...';
      refreshBtn.disabled = true;
      await loadSimilarThreads();
      renderThreadView();
    });
  }

  // Link All button
  const linkAllBtn = document.getElementById('link-all-similar');
  if (linkAllBtn) {
    linkAllBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!selectedThreadId) return;

      // Get filtered thread IDs (same filter as render)
      const linkedIds = new Set(linkedThreads.map(t => t.id));
      const filteredThreadIds = similarThreads
        .filter(({ thread }) => {
          if (linkedIds.has(thread.id)) return false;
          if (blockedSimilarPairs.has(`${selectedThreadId}:${thread.id}`) ||
              blockedSimilarPairs.has(`${thread.id}:${selectedThreadId}`)) return false;
          return true;
        })
        .map(({ thread }) => thread.id);

      if (filteredThreadIds.length === 0) return;

      linkAllBtn.textContent = '...';
      linkAllBtn.disabled = true;

      try {
        // Link all threads in parallel
        await Promise.all(filteredThreadIds.map(targetThreadId =>
          chrome.runtime.sendMessage({
            type: 'LINK_THREADS',
            sourceThreadId: selectedThreadId,
            targetThreadId: targetThreadId,
            linkType: 'related',
            notes: 'Auto-linked from similar threads (bulk)'
          })
        ));

        // Reload linked threads and re-render
        const response = await chrome.runtime.sendMessage({
          type: 'GET_LINKED_THREADS',
          threadId: selectedThreadId
        });
        linkedThreads = (response?.linkedThreads || []).map(l => l.thread).filter(Boolean);
        renderThreadView();
      } catch (err) {
        console.error('Failed to link threads:', err);
        linkAllBtn.textContent = 'Link All';
        linkAllBtn.disabled = false;
      }
    });
  }

  // Click to navigate to similar thread
  document.querySelectorAll('.similar-thread-card').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('link-similar-btn') ||
          e.target.classList.contains('block-similar-btn')) return;
      const threadId = item.dataset.threadId;
      selectThread(threadId);
    });
  });

  // Link similar thread button
  document.querySelectorAll('.link-similar-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const targetThreadId = btn.dataset.threadId;
      if (!selectedThreadId || !targetThreadId) return;

      try {
        await chrome.runtime.sendMessage({
          type: 'LINK_THREADS',
          sourceThreadId: selectedThreadId,
          targetThreadId: targetThreadId,
          linkType: 'related',
          notes: 'Auto-linked from similar threads'
        });

        // Reload linked threads and re-render
        const response = await chrome.runtime.sendMessage({
          type: 'GET_LINKED_THREADS',
          threadId: selectedThreadId
        });
        linkedThreads = (response?.linkedThreads || []).map(l => l.thread).filter(Boolean);
        renderThreadView();
      } catch (err) {
        console.error('Failed to link thread:', err);
      }
    });
  });

  // Block/No button - hide this pair from future similar results
  document.querySelectorAll('.block-similar-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const targetThreadId = btn.dataset.threadId;
      if (!selectedThreadId || !targetThreadId) return;

      // Add to blocked pairs (stored in memory, persisted to chrome.storage)
      const pairKey = `${selectedThreadId}:${targetThreadId}`;
      blockedSimilarPairs.add(pairKey);

      // Persist to chrome.storage
      try {
        const stored = await chrome.storage.local.get('blockedSimilarPairs');
        const pairs = stored.blockedSimilarPairs || [];
        pairs.push(pairKey);
        await chrome.storage.local.set({ blockedSimilarPairs: pairs });
      } catch (err) {
        console.error('Failed to persist blocked pair:', err);
      }

      // Re-render to hide the blocked thread
      renderThreadView();
    });
  });
}

function setupTitleEditListener() {
  const titleEl = document.querySelector('.editable-title');
  const inputEl = document.querySelector('.title-edit-input');
  if (!titleEl || !inputEl) return;

  titleEl.addEventListener('click', () => {
    titleEl.style.display = 'none';
    inputEl.style.display = 'block';
    inputEl.focus();
    inputEl.select();
  });

  const saveTitle = async () => {
    const newTitle = inputEl.value.trim();
    if (newTitle && newTitle !== titleEl.textContent && selectedThreadId) {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_THREAD',
        threadId: selectedThreadId,
        updates: { title: newTitle }
      });
      titleEl.textContent = newTitle;
      // Update in local state
      const thread = allThreads.find(t => t.id === selectedThreadId);
      if (thread) thread.title = newTitle;
      renderSidebar();
    }
    inputEl.style.display = 'none';
    titleEl.style.display = '';
  };

  inputEl.addEventListener('blur', saveTitle);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inputEl.blur();
    } else if (e.key === 'Escape') {
      inputEl.value = titleEl.textContent;
      inputEl.style.display = 'none';
      titleEl.style.display = '';
    }
  });
}

// ============================================================
// Link Modal
// ============================================================

function openLinkModal() {
  linkModalOpen = true;
  document.getElementById('link-modal').classList.add('active');
  document.getElementById('link-search').value = '';
  document.getElementById('link-search').focus();
  renderLinkSearchResults('');
}

function closeLinkModal() {
  linkModalOpen = false;
  document.getElementById('link-modal').classList.remove('active');
}

function renderLinkSearchResults(query) {
  const container = document.getElementById('link-results');
  if (!container) return;

  const queryLower = query.toLowerCase().trim();

  // Filter threads - exclude current thread and already linked threads
  const linkedIds = new Set(linkedThreads.map(t => t.id));
  linkedIds.add(selectedThreadId);

  let results = allThreads.filter(t => !linkedIds.has(t.id));

  if (queryLower) {
    results = results.filter(t =>
      (t.title || '').toLowerCase().includes(queryLower) ||
      (t.searchable_content || '').toLowerCase().includes(queryLower) ||
      (t.category || '').toLowerCase().includes(queryLower) ||
      (Array.isArray(t.tags) && t.tags.some(tag => tag.toLowerCase().includes(queryLower)))
    );
  }

  results = results.slice(0, 20);

  if (results.length === 0) {
    container.innerHTML = '<div class="link-no-results">No matching threads found</div>';
    return;
  }

  container.innerHTML = results.map(t => {
    const msgCount = t.message_count || t.messages?.length || 0;
    const categoryBadge = t.category ? `<span class="category-badge">${t.category}</span>` : '';

    return `
      <div class="link-result-item" data-thread-id="${t.id}">
        <div class="link-result-main">
          <span class="thread-item-provider provider-${t.provider}">${t.provider}</span>
          ${categoryBadge}
          <span class="link-result-title">${escapeHtml(t.title || 'Untitled')}</span>
        </div>
        <div class="link-result-meta">
          <span>${msgCount} msgs</span>
          <span>${formatRelativeTime(t.last_synced_at)}</span>
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers
  container.querySelectorAll('.link-result-item').forEach(item => {
    item.addEventListener('click', async () => {
      const targetId = item.dataset.threadId;
      await linkToThread(targetId);
    });
  });
}

async function linkToThread(targetThreadId) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'LINK_THREADS',
      sourceThreadId: selectedThreadId,
      targetThreadId: targetThreadId,
    });

    if (response?.success) {
      closeLinkModal();
      // Reload linked threads
      const linkResponse = await chrome.runtime.sendMessage({
        type: 'GET_LINKED_THREADS',
        threadId: selectedThreadId,
      });
      linkedThreads = (linkResponse?.linkedThreads || []).map(l => l.thread).filter(Boolean);
      renderThreadView();
    } else {
      console.error('Link failed:', response?.error);
    }
  } catch (err) {
    console.error('Failed to link threads:', err);
  }
}

async function unlinkThread(targetThreadId) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'UNLINK_THREADS',
      sourceThreadId: selectedThreadId,
      targetThreadId: targetThreadId,
    });

    if (response?.success) {
      // Reload linked threads
      const linkResponse = await chrome.runtime.sendMessage({
        type: 'GET_LINKED_THREADS',
        threadId: selectedThreadId,
      });
      linkedThreads = (linkResponse?.linkedThreads || []).map(l => l.thread).filter(Boolean);
      renderThreadView();
    } else {
      console.error('Unlink failed:', response?.error);
    }
  } catch (err) {
    console.error('Failed to unlink threads:', err);
  }
}

// ============================================================
// Tag Editor Modal
// ============================================================

function openTagEditor() {
  if (!selectedThreadId) return;

  const thread = allThreads.find(t => t.id === selectedThreadId);
  if (!thread) return;

  tagEditorOpen = true;
  tagEditorTags = [...(thread.tags || [])];
  tagEditorSelectedIndex = -1;
  tagEditorInput = '';

  renderTagEditorModal();
  document.getElementById('tag-editor-modal').classList.add('active');
  document.getElementById('tag-editor-input').focus();
}

function closeTagEditor() {
  tagEditorOpen = false;
  document.getElementById('tag-editor-modal').classList.remove('active');
}

function renderTagEditorModal() {
  const modal = document.getElementById('tag-editor-modal');
  if (!modal) return;

  // Get all existing tags from allThreads for suggestions
  const existingTags = new Set();
  allThreads.forEach(t => {
    (t.tags || []).forEach(tag => existingTags.add(tag));
  });
  const suggestions = [...existingTags].filter(t => !tagEditorTags.includes(t)).sort();

  const tagsHtml = tagEditorTags.map((tag, i) => `
    <span class="tag-editor-tag ${i === tagEditorSelectedIndex ? 'selected' : ''}" data-index="${i}">
      ${escapeHtml(tag)}
      <span class="tag-remove" data-tag="${escapeHtml(tag)}">×</span>
    </span>
  `).join('');

  const suggestionsHtml = suggestions.slice(0, 10).map(tag => `
    <span class="tag-suggestion" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>
  `).join('');

  modal.innerHTML = `
    <div class="tag-editor-content">
      <div class="tag-editor-header">
        <h3>Edit Tags</h3>
        <span class="tag-editor-hint">↑↓ to select, Backspace to remove, Enter to add</span>
      </div>
      <div class="tag-editor-tags">${tagsHtml || '<span class="tag-editor-empty">No tags</span>'}</div>
      <input type="text" id="tag-editor-input" placeholder="Type to add tag..." value="${escapeHtml(tagEditorInput)}">
      ${suggestionsHtml ? `<div class="tag-editor-suggestions"><span class="suggestions-label">Suggestions:</span> ${suggestionsHtml}</div>` : ''}
      <div class="tag-editor-actions">
        <button class="btn-secondary" id="tag-editor-cancel">Cancel (Esc)</button>
        <button class="btn-primary" id="tag-editor-save">Save Tags</button>
      </div>
    </div>
  `;

  // Add event listeners
  modal.querySelector('#tag-editor-cancel').addEventListener('click', closeTagEditor);
  modal.querySelector('#tag-editor-save').addEventListener('click', saveTagEditorTags);

  modal.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tag = btn.dataset.tag;
      tagEditorTags = tagEditorTags.filter(t => t !== tag);
      renderTagEditorModal();
      document.getElementById('tag-editor-input').focus();
    });
  });

  modal.querySelectorAll('.tag-suggestion').forEach(el => {
    el.addEventListener('click', () => {
      const tag = el.dataset.tag;
      if (!tagEditorTags.includes(tag)) {
        tagEditorTags.push(tag);
        renderTagEditorModal();
        document.getElementById('tag-editor-input').focus();
      }
    });
  });
}

function handleTagEditorKeys(e) {
  const input = document.getElementById('tag-editor-input');

  switch (e.key) {
    case 'Escape':
      e.preventDefault();
      closeTagEditor();
      break;

    case 'Enter':
      e.preventDefault();
      if (input && input.value.trim()) {
        const newTag = input.value.trim().toLowerCase();
        if (!tagEditorTags.includes(newTag)) {
          tagEditorTags.push(newTag);
        }
        tagEditorInput = '';
        renderTagEditorModal();
        document.getElementById('tag-editor-input').focus();
      } else if (tagEditorSelectedIndex >= 0) {
        // Remove selected tag
        tagEditorTags.splice(tagEditorSelectedIndex, 1);
        tagEditorSelectedIndex = -1;
        renderTagEditorModal();
        document.getElementById('tag-editor-input').focus();
      } else {
        // Save and close
        saveTagEditorTags();
      }
      break;

    case 'Backspace':
      if (input && input.value === '' && tagEditorTags.length > 0) {
        e.preventDefault();
        if (tagEditorSelectedIndex >= 0) {
          tagEditorTags.splice(tagEditorSelectedIndex, 1);
          tagEditorSelectedIndex = -1;
        } else {
          tagEditorSelectedIndex = tagEditorTags.length - 1;
        }
        renderTagEditorModal();
        document.getElementById('tag-editor-input').focus();
      }
      break;

    case 'ArrowLeft':
      if (input && input.selectionStart === 0 && tagEditorTags.length > 0) {
        e.preventDefault();
        if (tagEditorSelectedIndex < 0) {
          tagEditorSelectedIndex = tagEditorTags.length - 1;
        } else if (tagEditorSelectedIndex > 0) {
          tagEditorSelectedIndex--;
        }
        renderTagEditorModal();
        document.getElementById('tag-editor-input').focus();
      }
      break;

    case 'ArrowRight':
      if (tagEditorSelectedIndex >= 0) {
        e.preventDefault();
        if (tagEditorSelectedIndex < tagEditorTags.length - 1) {
          tagEditorSelectedIndex++;
        } else {
          tagEditorSelectedIndex = -1;
        }
        renderTagEditorModal();
        document.getElementById('tag-editor-input').focus();
      }
      break;
  }
}

async function saveTagEditorTags() {
  if (!selectedThreadId) return;

  try {
    await chrome.runtime.sendMessage({
      type: 'UPDATE_THREAD',
      threadId: selectedThreadId,
      updates: { tags: tagEditorTags }
    });

    closeTagEditor();
    await loadThreads();
    renderThreadView();
  } catch (err) {
    console.error('Failed to save tags:', err);
  }
}

// ============================================================
// Project Selector Modal
// ============================================================

function openProjectSelector() {
  if (!selectedThreadId) return;

  projectSelectorOpen = true;
  projectSelectorSelectedIndex = 0;

  renderProjectSelectorModal();
  document.getElementById('project-selector-modal').classList.add('active');
  document.getElementById('project-selector-input').focus();
}

function closeProjectSelector() {
  projectSelectorOpen = false;
  document.getElementById('project-selector-modal').classList.remove('active');
}

function renderProjectSelectorModal() {
  const modal = document.getElementById('project-selector-modal');
  if (!modal) return;

  const input = document.getElementById('project-selector-input')?.value || '';
  const inputLower = input.toLowerCase();

  // Filter projects
  let filteredProjects = allProjects;
  if (inputLower) {
    filteredProjects = allProjects.filter(p =>
      (p.name || '').toLowerCase().includes(inputLower)
    );
  }

  // Add "Create new" option if there's input
  const showCreateNew = inputLower && !filteredProjects.some(p => (p.name || '').toLowerCase() === inputLower);

  const projectsHtml = filteredProjects.slice(0, 10).map((project, i) => {
    const isInProject = threadProjects.some(p => p.id === project.id);
    return `
      <div class="project-selector-item ${i === projectSelectorSelectedIndex ? 'selected' : ''} ${isInProject ? 'in-project' : ''}" data-project-id="${project.id}">
        <span class="project-selector-name">${escapeHtml(project.name || 'Untitled')}</span>
        ${isInProject ? '<span class="project-selector-check">✓</span>' : ''}
      </div>
    `;
  }).join('');

  const createNewHtml = showCreateNew ? `
    <div class="project-selector-item create-new ${projectSelectorSelectedIndex === filteredProjects.length ? 'selected' : ''}" data-create-name="${escapeHtml(input)}">
      <span class="project-selector-name">+ Create "${escapeHtml(input)}"</span>
    </div>
  ` : '';

  modal.innerHTML = `
    <div class="project-selector-content">
      <div class="project-selector-header">
        <h3>Add to Project</h3>
        <span class="project-selector-hint">↑↓ to select, Enter to toggle</span>
      </div>
      <input type="text" id="project-selector-input" placeholder="Search or create project..." value="${escapeHtml(input)}">
      <div class="project-selector-list">
        ${projectsHtml}
        ${createNewHtml}
        ${filteredProjects.length === 0 && !showCreateNew ? '<div class="project-selector-empty">No projects found</div>' : ''}
      </div>
      <div class="project-selector-actions">
        <button class="btn-secondary" id="project-selector-cancel">Close (Esc)</button>
      </div>
    </div>
  `;

  // Re-attach input listener
  const newInput = modal.querySelector('#project-selector-input');
  newInput.addEventListener('input', () => {
    projectSelectorSelectedIndex = 0;
    renderProjectSelectorModal();
    document.getElementById('project-selector-input').focus();
    // Restore cursor position
    const len = document.getElementById('project-selector-input').value.length;
    document.getElementById('project-selector-input').setSelectionRange(len, len);
  });

  modal.querySelector('#project-selector-cancel').addEventListener('click', closeProjectSelector);

  modal.querySelectorAll('.project-selector-item').forEach(el => {
    el.addEventListener('click', async () => {
      if (el.classList.contains('create-new')) {
        await createAndAddProject(el.dataset.createName);
      } else {
        await toggleProjectMembership(el.dataset.projectId);
      }
    });
  });
}

function handleProjectSelectorKeys(e) {
  const input = document.getElementById('project-selector-input');
  const inputVal = input?.value || '';
  const inputLower = inputVal.toLowerCase();

  let filteredProjects = allProjects;
  if (inputLower) {
    filteredProjects = allProjects.filter(p =>
      (p.name || '').toLowerCase().includes(inputLower)
    );
  }
  const showCreateNew = inputLower && !filteredProjects.some(p => (p.name || '').toLowerCase() === inputLower);
  const maxIndex = filteredProjects.length + (showCreateNew ? 1 : 0) - 1;

  switch (e.key) {
    case 'Escape':
      e.preventDefault();
      closeProjectSelector();
      break;

    case 'ArrowDown':
      e.preventDefault();
      projectSelectorSelectedIndex = Math.min(projectSelectorSelectedIndex + 1, maxIndex);
      renderProjectSelectorModal();
      document.getElementById('project-selector-input').focus();
      break;

    case 'ArrowUp':
      e.preventDefault();
      projectSelectorSelectedIndex = Math.max(projectSelectorSelectedIndex - 1, 0);
      renderProjectSelectorModal();
      document.getElementById('project-selector-input').focus();
      break;

    case 'Enter':
      e.preventDefault();
      if (projectSelectorSelectedIndex < filteredProjects.length) {
        toggleProjectMembership(filteredProjects[projectSelectorSelectedIndex].id);
      } else if (showCreateNew) {
        createAndAddProject(inputVal);
      }
      break;
  }
}

async function toggleProjectMembership(projectId) {
  if (!selectedThreadId || !projectId) return;

  const isInProject = threadProjects.some(p => p.id === projectId);

  try {
    if (isInProject) {
      await chrome.runtime.sendMessage({
        type: 'REMOVE_THREAD_FROM_PROJECT',
        threadId: selectedThreadId,
        projectId: projectId
      });
    } else {
      await chrome.runtime.sendMessage({
        type: 'ADD_THREAD_TO_PROJECT',
        threadId: selectedThreadId,
        projectId: projectId
      });
    }

    // Reload thread projects
    const projectsResponse = await chrome.runtime.sendMessage({
      type: 'GET_THREAD_PROJECTS',
      threadId: selectedThreadId
    });
    threadProjects = projectsResponse?.projects || [];

    renderProjectSelectorModal();
    document.getElementById('project-selector-input').focus();
    renderThreadView();
  } catch (err) {
    console.error('Failed to toggle project membership:', err);
  }
}

async function createAndAddProject(name) {
  if (!selectedThreadId || !name) return;

  try {
    // Create project
    const createResponse = await chrome.runtime.sendMessage({
      type: 'CREATE_PROJECT',
      name: name
    });

    if (createResponse?.success && createResponse.project) {
      // Add to allProjects
      allProjects.push(createResponse.project);

      // Add thread to project
      await chrome.runtime.sendMessage({
        type: 'ADD_THREAD_TO_PROJECT',
        threadId: selectedThreadId,
        projectId: createResponse.project.id
      });

      // Reload thread projects
      const projectsResponse = await chrome.runtime.sendMessage({
        type: 'GET_THREAD_PROJECTS',
        threadId: selectedThreadId
      });
      threadProjects = projectsResponse?.projects || [];

      closeProjectSelector();
      renderThreadView();
    }
  } catch (err) {
    console.error('Failed to create project:', err);
  }
}

function renderListView() {
  const container = document.getElementById('list-view');
  container.innerHTML = '';

  // Sort threads for table
  const sortedThreads = [...filteredThreads].sort((a, b) => {
    let aVal, bVal;
    switch (listSortColumn) {
      case 'title':
        aVal = (a.title || '').toLowerCase();
        bVal = (b.title || '').toLowerCase();
        break;
      case 'provider':
        aVal = a.provider || '';
        bVal = b.provider || '';
        break;
      case 'message_count':
        aVal = a.message_count || a.messages?.length || 0;
        bVal = b.message_count || b.messages?.length || 0;
        break;
      case 'created_at':
        aVal = new Date(a.created_at || a.last_synced_at || 0).getTime();
        bVal = new Date(b.created_at || b.last_synced_at || 0).getTime();
        break;
      case 'last_synced_at':
        aVal = new Date(a.last_synced_at || 0).getTime();
        bVal = new Date(b.last_synced_at || 0).getTime();
        break;
      case 'category':
        aVal = a.category || 'zzz';
        bVal = b.category || 'zzz';
        break;
      case 'status':
        aVal = a.status || 'zzz';
        bVal = b.status || 'zzz';
        break;
      case 'github_repo':
        aVal = a.github_repo || 'zzz';
        bVal = b.github_repo || 'zzz';
        break;
      case 'organization':
        aVal = a.organization || 'zzz';
        bVal = b.organization || 'zzz';
        break;
      default:
        aVal = new Date(a.last_synced_at || 0).getTime();
        bVal = new Date(b.last_synced_at || 0).getTime();
    }

    if (typeof aVal === 'string') {
      const cmp = aVal.localeCompare(bVal);
      return listSortDirection === 'asc' ? cmp : -cmp;
    }
    return listSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
  });

  // Build table
  const table = document.createElement('table');
  table.className = 'threads-table';

  // Table header
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th class="th-sortable ${listSortColumn === 'title' ? 'sorted-' + listSortDirection : ''}" data-column="title">
        Title ${listSortColumn === 'title' ? (listSortDirection === 'asc' ? '↑' : '↓') : ''}
      </th>
      <th class="th-sortable ${listSortColumn === 'provider' ? 'sorted-' + listSortDirection : ''}" data-column="provider">
        Provider ${listSortColumn === 'provider' ? (listSortDirection === 'asc' ? '↑' : '↓') : ''}
      </th>
      <th class="th-sortable ${listSortColumn === 'message_count' ? 'sorted-' + listSortDirection : ''}" data-column="message_count">
        Msgs ${listSortColumn === 'message_count' ? (listSortDirection === 'asc' ? '↑' : '↓') : ''}
      </th>
      <th class="th-sortable ${listSortColumn === 'category' ? 'sorted-' + listSortDirection : ''}" data-column="category">
        Category ${listSortColumn === 'category' ? (listSortDirection === 'asc' ? '↑' : '↓') : ''}
      </th>
      <th class="th-sortable ${listSortColumn === 'status' ? 'sorted-' + listSortDirection : ''}" data-column="status">
        Status ${listSortColumn === 'status' ? (listSortDirection === 'asc' ? '↑' : '↓') : ''}
      </th>
      <th class="th-sortable ${listSortColumn === 'github_repo' ? 'sorted-' + listSortDirection : ''}" data-column="github_repo">
        Repo ${listSortColumn === 'github_repo' ? (listSortDirection === 'asc' ? '↑' : '↓') : ''}
      </th>
      <th class="th-sortable ${listSortColumn === 'organization' ? 'sorted-' + listSortDirection : ''}" data-column="organization">
        Org ${listSortColumn === 'organization' ? (listSortDirection === 'asc' ? '↑' : '↓') : ''}
      </th>
      <th class="th-sortable ${listSortColumn === 'created_at' ? 'sorted-' + listSortDirection : ''}" data-column="created_at">
        Created ${listSortColumn === 'created_at' ? (listSortDirection === 'asc' ? '↑' : '↓') : ''}
      </th>
      <th class="th-sortable ${listSortColumn === 'last_synced_at' ? 'sorted-' + listSortDirection : ''}" data-column="last_synced_at">
        Synced ${listSortColumn === 'last_synced_at' ? (listSortDirection === 'asc' ? '↑' : '↓') : ''}
      </th>
      <th>Attachments</th>
      <th>Open</th>
    </tr>
  `;
  table.appendChild(thead);

  // Add click handlers to sortable headers
  thead.querySelectorAll('.th-sortable').forEach(th => {
    th.addEventListener('click', () => {
      const column = th.dataset.column;
      if (listSortColumn === column) {
        listSortDirection = listSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        listSortColumn = column;
        listSortDirection = 'desc';
      }
      renderListView();
    });
  });

  // Table body
  const tbody = document.createElement('tbody');
  sortedThreads.forEach((thread, index) => {
    const row = document.createElement('tr');
    row.className = 'table-row';
    if (index === focusedThreadIndex && focusMode === 'threads') row.classList.add('focused');
    row.dataset.threadId = thread.id;
    row.dataset.index = index;

    const msgCount = thread.message_count || thread.messages?.length || 0;
    const createdTime = thread.created_at ? formatRelativeTime(thread.created_at) : '-';
    const syncTime = formatRelativeTime(thread.last_synced_at);
    const providerUrl = buildProviderUrl(thread.provider, thread.provider_thread_id || thread.id, thread.url);

    const attachmentBadges = getAttachmentBadgesHtml(thread.attachment_types);

    row.innerHTML = `
      <td class="td-title">${escapeHtml(thread.title || 'Untitled')}</td>
      <td><span class="thread-item-provider provider-${thread.provider}">${thread.provider}</span></td>
      <td class="td-center">${msgCount}</td>
      <td>${thread.category ? `<span class="category-badge">${escapeHtml(thread.category)}</span>` : '-'}</td>
      <td>${thread.status ? `<span class="status-badge status-${thread.status}">${thread.status.replace('_', ' ')}</span>` : '-'}</td>
      <td>${thread.github_repo ? `<span class="meta-badge repo">${escapeHtml(thread.github_repo)}</span>` : '-'}</td>
      <td>${thread.organization ? `<span class="meta-badge org">${escapeHtml(thread.organization)}</span>` : '-'}</td>
      <td class="td-date">${createdTime}</td>
      <td class="td-date">${syncTime}</td>
      <td class="td-attachments">${attachmentBadges || '-'}</td>
      <td class="td-center">
        ${providerUrl ? `<a href="${providerUrl}" target="_blank" class="open-link" title="Open in ${thread.provider}">↗</a>` : '-'}
      </td>
    `;

    // Click on row (except the link) opens thread view
    row.addEventListener('click', (e) => {
      if (e.target.closest('.open-link')) return; // Don't navigate when clicking external link
      focusedThreadIndex = index;
      focusMode = 'threads';
      updateFocus();
      selectThread(thread.id);
      setView('thread');
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

// Legacy function kept for compatibility with cards/kanban
function createListItem(thread, index) {
  const el = document.createElement('div');
  el.className = 'list-item';
  if (index === focusedThreadIndex && focusMode === 'threads') el.classList.add('focused');
  el.dataset.threadId = thread.id;
  el.dataset.index = index;

  const msgCount = thread.message_count || thread.messages?.length || 0;
  const syncTime = formatRelativeTime(thread.last_synced_at);

  // Category badge
  const categoryBadge = thread.category
    ? `<span class="category-badge">${thread.category}</span>`
    : '';

  el.innerHTML = `
    <span class="thread-item-provider provider-${thread.provider}">${thread.provider}</span>
    ${categoryBadge}
    <span class="list-item-title">${escapeHtml(thread.title || 'Untitled')}</span>
    <span class="list-item-meta">
      <span>${msgCount} msgs</span>
      <span>${syncTime}</span>
    </span>
  `;

  el.addEventListener('click', () => {
    focusedThreadIndex = index;
    focusMode = 'threads';
    updateFocus();
    selectThread(thread.id);
    setView('thread');
  });

  return el;
}

function groupThreadsBy(threads, groupBy) {
  const groups = new Map();

  threads.forEach(thread => {
    let key;
    switch (groupBy) {
      case 'category':
        key = thread.category || 'uncategorized';
        break;
      case 'status':
        key = thread.status || 'unknown';
        break;
      case 'provider':
        key = thread.provider || 'unknown';
        break;
      case 'priority':
        key = thread.priority || 'medium';
        break;
      default:
        key = 'all';
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(thread);
  });

  // Sort groups by name
  return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function formatGroupName(name, groupBy) {
  if (!name) return 'Unknown';

  // Capitalize and format
  const formatted = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // Add emoji for certain group types
  if (groupBy === 'status') {
    const icons = {
      'New': '🆕',
      'In Progress': '🔄',
      'Complete': '✅',
      'On Hold': '⏸️',
      'Abandoned': '❌',
      'Unknown': '❓'
    };
    return `${icons[formatted] || ''} ${formatted}`;
  }

  if (groupBy === 'priority') {
    const icons = { 'High': '🔴', 'Medium': '🟡', 'Low': '🟢' };
    return `${icons[formatted] || ''} ${formatted}`;
  }

  if (groupBy === 'category') {
    const icons = {
      'Work': '💼',
      'Personal': '👤',
      'Home': '🏠',
      'Hobbies': '🎮',
      'Finance': '💰',
      'Health': '❤️',
      'Learning': '📚',
      'Admin': '📋',
      'Other': '📦',
      'Uncategorized': '❓'
    };
    return `${icons[formatted] || ''} ${formatted}`;
  }

  return formatted;
}

function renderCardsView() {
  const container = document.getElementById('cards-view');
  container.innerHTML = '';

  // Cards view with grouping uses a different layout
  if (currentGroupBy !== 'none' && currentGroupBy !== 'status') {
    // Remove grid, use column layout for groups
    container.style.display = 'block';
    container.style.gridTemplateColumns = 'unset';

    const groups = groupThreadsBy(filteredThreads, currentGroupBy);
    let globalIndex = 0;

    for (const [groupName, threads] of groups) {
      // Group header
      const header = document.createElement('div');
      header.className = 'group-header';
      header.style.margin = '0 -24px';
      header.style.padding = '12px 24px';
      header.innerHTML = `
        <span>${escapeHtml(formatGroupName(groupName, currentGroupBy))}</span>
        <span class="group-count">${threads.length}</span>
      `;
      container.appendChild(header);

      // Cards grid for this group
      const cardsGrid = document.createElement('div');
      cardsGrid.style.display = 'grid';
      cardsGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
      cardsGrid.style.gap = '16px';
      cardsGrid.style.marginBottom = '16px';

      threads.forEach((thread) => {
        const index = globalIndex++;
        cardsGrid.appendChild(createCardItem(thread, index));
      });

      container.appendChild(cardsGrid);
    }
  } else {
    // Normal grid layout
    container.style.display = '';
    container.style.gridTemplateColumns = '';

    filteredThreads.forEach((thread, index) => {
      container.appendChild(createCardItem(thread, index));
    });
  }
}

function createCardItem(thread, index) {
  const el = document.createElement('div');
  el.className = 'thread-card';
  if (index === focusedThreadIndex && focusMode === 'threads') el.classList.add('focused');
  el.dataset.threadId = thread.id;
  el.dataset.index = index;
  if (thread.status) el.dataset.status = thread.status;

  const msgCount = thread.message_count || thread.messages?.length || 0;
  const syncTime = formatRelativeTime(thread.last_synced_at);
  const summary = thread.ai_summary || thread.provider_summary || '';

  // Status badge
  const statusBadge = thread.status
    ? `<span class="status-badge status-${thread.status}">${thread.status.replace('_', ' ')}</span>`
    : '';

  // Tags (show first 3, with consistent colors)
  const tags = Array.isArray(thread.tags) ? thread.tags.slice(0, 3) : [];
  const tagsHtml = tags.length
    ? `<div class="tags-container" style="margin-top: 8px;">${tags.map(t => `<span class="tag" style="${getTagStyle(t)}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  // Meta badges for repo/org
  let metaBadgesHtml = '';
  if (thread.github_repo) {
    metaBadgesHtml += `<span class="meta-badge repo" title="GitHub Repo">${escapeHtml(thread.github_repo)}</span>`;
  }
  if (thread.organization) {
    metaBadgesHtml += `<span class="meta-badge org" title="Organization">${escapeHtml(thread.organization)}</span>`;
  }

  el.innerHTML = `
    <div class="thread-card-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
      <span class="thread-item-provider provider-${thread.provider}">${thread.provider}</span>
      ${statusBadge}
    </div>
    <div class="thread-card-title">${escapeHtml(thread.title || 'Untitled')}</div>
    ${summary ? `<div class="thread-card-summary">${escapeHtml(summary)}</div>` : ''}
    ${metaBadgesHtml ? `<div class="thread-item-badges">${metaBadgesHtml}</div>` : ''}
    ${tagsHtml}
    <div class="thread-card-footer">
      ${thread.category ? `<span class="category-badge">${thread.category}</span>` : ''}
      <span>${msgCount} msgs • ${syncTime}</span>
    </div>
  `;

  el.addEventListener('click', () => {
    focusedThreadIndex = index;
    focusMode = 'threads';
    updateFocus();
    selectThread(thread.id);
    setView('thread');
  });

  return el;
}

function renderKanbanView() {
  const container = document.getElementById('kanban-view');
  container.innerHTML = '';

  // Define status columns
  const columns = [
    { status: 'new', label: 'New', color: '#5cb3ff' },
    { status: 'in_progress', label: 'In Progress', color: '#ffdb5c' },
    { status: 'complete', label: 'Complete', color: '#5cff8a' },
    { status: 'on_hold', label: 'On Hold', color: '#ffa85c' },
    { status: 'abandoned', label: 'Abandoned', color: '#ff5c5c' },
  ];

  // Group threads by status
  const threadsByStatus = {};
  columns.forEach(col => {
    threadsByStatus[col.status] = [];
  });

  // Threads without status go to 'new'
  filteredThreads.forEach(thread => {
    const status = thread.status || 'new';
    if (threadsByStatus[status]) {
      threadsByStatus[status].push(thread);
    } else {
      threadsByStatus['new'].push(thread);
    }
  });

  // Create columns
  columns.forEach(col => {
    const threads = threadsByStatus[col.status];
    const columnEl = document.createElement('div');
    columnEl.className = 'kanban-column';
    columnEl.dataset.status = col.status;

    columnEl.innerHTML = `
      <div class="kanban-column-header">
        <span style="color: ${col.color};">●</span>
        <span>${col.label}</span>
        <span class="count">${threads.length}</span>
      </div>
      <div class="kanban-column-cards"></div>
    `;

    const cardsContainer = columnEl.querySelector('.kanban-column-cards');

    threads.forEach(thread => {
      const cardEl = document.createElement('div');
      cardEl.className = 'kanban-card';
      cardEl.dataset.threadId = thread.id;

      const msgCount = thread.message_count || thread.messages?.length || 0;
      const tags = Array.isArray(thread.tags) ? thread.tags.slice(0, 2) : [];
      const tagsHtml = tags.length
        ? tags.map(t => `<span class="tag" style="font-size: 9px; padding: 1px 5px; ${getTagStyle(t)}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')
        : '';

      // Meta badges for repo/org
      let metaBadgesHtml = '';
      if (thread.github_repo) {
        metaBadgesHtml += `<span class="meta-badge repo" style="font-size: 9px;" title="GitHub Repo">${escapeHtml(thread.github_repo)}</span>`;
      }
      if (thread.organization) {
        metaBadgesHtml += `<span class="meta-badge org" style="font-size: 9px;" title="Organization">${escapeHtml(thread.organization)}</span>`;
      }

      cardEl.innerHTML = `
        <div class="kanban-card-title">${escapeHtml(thread.title || 'Untitled')}</div>
        <div class="kanban-card-meta">
          <span class="thread-item-provider provider-${thread.provider}">${thread.provider}</span>
          <span>${msgCount} msgs</span>
        </div>
        ${metaBadgesHtml ? `<div style="margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap;">${metaBadgesHtml}</div>` : ''}
        ${tagsHtml ? `<div style="margin-top: 6px; display: flex; gap: 4px; flex-wrap: wrap;">${tagsHtml}</div>` : ''}
      `;

      cardEl.addEventListener('click', () => {
        const index = filteredThreads.findIndex(t => t.id === thread.id);
        if (index >= 0) {
          focusedThreadIndex = index;
          focusMode = 'threads';
          updateFocus();
        }
        selectThread(thread.id);
        setView('thread');
      });

      cardsContainer.appendChild(cardEl);
    });

    container.appendChild(columnEl);
  });

  // Setup drag and drop after rendering
  setupKanbanDragDrop();
}

// ============================================================
// Thread Selection
// ============================================================

async function selectThread(threadId) {
  selectedThreadId = threadId;
  focusMode = 'messages';
  focusedMessageIndex = -1;
  similarThreads = []; // Clear similar threads when navigating
  similarSearchPerformed = false; // Reset search state for new thread

  // Switch to thread view when selecting a thread
  if (currentView !== 'thread') {
    setView('thread');
  }

  // Update sidebar selection
  document.querySelectorAll('.thread-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.threadId === threadId);
  });

  // Load full thread data with messages, linked threads, and projects
  try {
    const [threadResponse, linkResponse, projectsResponse] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_THREAD', threadId }),
      chrome.runtime.sendMessage({ type: 'GET_LINKED_THREADS', threadId }),
      chrome.runtime.sendMessage({ type: 'GET_THREAD_PROJECTS', threadId }),
    ]);

    if (threadResponse?.success) {
      selectedThreadMessages = threadResponse.messages || [];
    }

    linkedThreads = (linkResponse?.linkedThreads || []).map(l => l.thread).filter(Boolean);
    threadProjects = projectsResponse?.projects || [];

    renderThreadView();

    // Update URL without reload
    const url = new URL(window.location);
    url.searchParams.set('id', threadId);
    history.replaceState({}, '', url);
  } catch (err) {
    console.error('Failed to load thread:', err);
  }
}

// ============================================================
// View Switching
// ============================================================

function setView(view) {
  currentView = view;

  // Update toggle buttons
  document.querySelectorAll('.view-toggle').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Show/hide containers
  document.getElementById('thread-view').classList.toggle('active', view === 'thread');
  document.getElementById('list-view').classList.toggle('active', view === 'list');
  document.getElementById('cards-view').classList.toggle('active', view === 'cards');
  document.getElementById('kanban-view').classList.toggle('active', view === 'kanban');

  // Hide grouping, re-tag all, and export when in thread view (not relevant for single thread)
  const isThreadView = view === 'thread';
  document.getElementById('group-by').style.display = isThreadView ? 'none' : '';
  document.getElementById('retag-btn').style.display = isThreadView ? 'none' : '';
  document.getElementById('export-btn').style.display = isThreadView ? 'none' : '';

  renderCurrentView();
}

// ============================================================
// Message Toggle
// ============================================================

function toggleMessage(el) {
  el.classList.toggle('collapsed');
  const toggle = el.querySelector('.message-toggle');
  toggle.textContent = el.classList.contains('collapsed') ? '▶' : '▼';
}

function expandMessage(index) {
  const messages = document.querySelectorAll('.message');
  if (messages[index]) {
    messages[index].classList.remove('collapsed');
    const toggle = messages[index].querySelector('.message-toggle');
    toggle.textContent = '▼';
  }
}

function collapseMessage(index) {
  const messages = document.querySelectorAll('.message');
  if (messages[index]) {
    messages[index].classList.add('collapsed');
    const toggle = messages[index].querySelector('.message-toggle');
    toggle.textContent = '▶';
    // Scroll the collapsed message to the top of the viewport
    messages[index].scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}

function expandAllMessages() {
  document.querySelectorAll('.message').forEach(el => {
    el.classList.remove('collapsed');
    el.querySelector('.message-toggle').textContent = '▼';
  });
}

function collapseAllMessages() {
  document.querySelectorAll('.message').forEach(el => {
    el.classList.add('collapsed');
    el.querySelector('.message-toggle').textContent = '▶';
  });
}

// ============================================================
// Command Palette
// ============================================================

let cmdPaletteOpen = false;
let cmdSelectedIndex = 0;
let cmdResults = [];

function openCommandPalette() {
  cmdPaletteOpen = true;
  cmdSelectedIndex = 0;
  document.getElementById('cmd-palette').classList.add('active');
  document.getElementById('cmd-input').value = '';
  document.getElementById('cmd-input').focus();
  renderCommandResults('');
}

function closeCommandPalette() {
  cmdPaletteOpen = false;
  document.getElementById('cmd-palette').classList.remove('active');
}

async function renderCommandResults(query) {
  const container = document.getElementById('cmd-results');
  cmdResults = [];

  // Add actions first
  const actions = [
    { type: 'action', icon: '📋', title: 'Toggle List View', hint: 'Switch to list view (2)', action: () => setView('list') },
    { type: 'action', icon: '🃏', title: 'Toggle Card View', hint: 'Switch to card view (3)', action: () => setView('cards') },
    { type: 'action', icon: '📊', title: 'Toggle Kanban View', hint: 'Switch to kanban board (4)', action: () => setView('kanban') },
    { type: 'action', icon: '💬', title: 'Toggle Thread View', hint: 'Switch to thread view (1)', action: () => setView('thread') },
    { type: 'action', icon: '📥', title: 'Expand All Messages', hint: 'Show all message content (⇧E)', action: expandAllMessages },
    { type: 'action', icon: '📤', title: 'Collapse All Messages', hint: 'Hide all message content (⇧C)', action: collapseAllMessages },
    { type: 'action', icon: '🏷️', title: 'Re-tag All Threads', hint: 'Re-run AI classification on all threads', action: retagAllThreads },
    { type: 'action', icon: '🔄', title: 'Re-tag Current Thread', hint: 'Re-run AI classification (r)', action: retagCurrentThread },
    { type: 'action', icon: '💾', title: 'Export Current Thread', hint: 'Export to markdown (x)', action: exportCurrentThread },
    { type: 'action', icon: '📦', title: 'Export All Filtered', hint: 'Export all filtered threads (⇧X)', action: exportAllThreads },
    { type: 'action', icon: '📊', title: 'View Stats', hint: 'Open data overview (s)', action: openStatsModal },
    { type: 'action', icon: '🏷️', title: 'Focus Tags Filter', hint: 'Jump to tags filter (t)', action: toggleTagsFilterFocus },
  ];

  // Filter actions by query
  const filteredActions = query
    ? actions.filter(a => a.title.toLowerCase().includes(query.toLowerCase()))
    : actions;

  cmdResults.push(...filteredActions);

  // Add matching threads using TF-IDF search (ranked by relevance, includes tags)
  let matchingThreads = [];
  if (query && query.trim()) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TFIDF_SEARCH',
        query: query.trim(),
        topK: 10
      });
      if (response?.success && response.results) {
        matchingThreads = response.results.map(r => ({
          ...r.thread,
          matchType: r.matchType,
          score: r.score,
          snippet: r.snippet,
          snippetSource: r.snippetSource
        }));
      }
    } catch (e) {
      // Fallback to simple search if TF-IDF fails
      const queryLower = query.toLowerCase();
      matchingThreads = allThreads.filter(t =>
        (t.title || '').toLowerCase().includes(queryLower) ||
        (t.searchable_content || '').toLowerCase().includes(queryLower) ||
        (t.tags || []).some(tag => tag.toLowerCase().includes(queryLower))
      ).slice(0, 10);
    }
  } else {
    matchingThreads = allThreads.slice(0, 5);
  }

  matchingThreads.forEach(t => {
    const matchHint = t.matchType === 'tag+tfidf' ? ' 🏷️' : '';
    cmdResults.push({
      type: 'thread',
      icon: getProviderIcon(t.provider),
      title: t.title || 'Untitled',
      hint: `${t.provider} • ${t.message_count || t.messages?.length || 0} msgs${matchHint}`,
      snippet: t.snippet || null,
      threadId: t.id,
    });
  });

  // Render
  container.innerHTML = '';
  cmdResults.forEach((result, index) => {
    const el = document.createElement('div');
    el.className = 'cmd-result';
    if (index === cmdSelectedIndex) el.classList.add('selected');
    el.dataset.index = index;

    const snippetHtml = result.snippet
      ? `<div class="cmd-result-snippet">${escapeHtml(result.snippet)}</div>`
      : '';

    el.innerHTML = `
      <div class="cmd-result-icon">${result.icon}</div>
      <div class="cmd-result-text">
        <div class="cmd-result-title">${escapeHtml(result.title)}</div>
        <div class="cmd-result-hint">${escapeHtml(result.hint)}</div>
        ${snippetHtml}
      </div>
    `;

    el.addEventListener('click', () => executeCommandResult(result));
    el.addEventListener('mouseenter', () => {
      cmdSelectedIndex = index;
      updateCommandSelection();
    });

    container.appendChild(el);
  });
}

function updateCommandSelection() {
  document.querySelectorAll('.cmd-result').forEach((el, i) => {
    el.classList.toggle('selected', i === cmdSelectedIndex);
  });
}

function executeCommandResult(result) {
  closeCommandPalette();

  if (result.type === 'action' && result.action) {
    result.action();
  } else if (result.type === 'thread' && result.threadId) {
    const index = filteredThreads.findIndex(t => t.id === result.threadId);
    if (index >= 0) {
      focusedThreadIndex = index;
      focusMode = 'threads';
      updateFocus();
    }
    selectThread(result.threadId);
    setView('thread');
  }
}

function getProviderIcon(provider) {
  switch (provider) {
    case 'chatgpt': return '🟢';
    case 'claude': return '🟠';
    case 'gemini': return '🔵';
    case 'grok': return '🟣';
    default: return '💬';
  }
}

function getProviderDisplayName(provider) {
  switch (provider) {
    case 'chatgpt': return 'ChatGPT';
    case 'claude': return 'Claude';
    case 'gemini': return 'Gemini';
    case 'grok': return 'Grok';
    default: return 'Assistant';
  }
}

function getProviderAvatar(provider) {
  const iconName = PROVIDER_ICON_MAP[provider] || 'bot';
  return getIcon(iconName, { size: 16 });
}

// ============================================================
// Keyboard Navigation
// ============================================================

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Stats modal handling
    if (statsModalOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeStatsModal();
      }
      return;
    }

    // Validation modal handling
    if (validationModalOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeValidationModal();
      }
      return;
    }

    // Link modal handling
    if (linkModalOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLinkModal();
      }
      return;
    }

    // Tag editor handling
    if (tagEditorOpen) {
      handleTagEditorKeys(e);
      return;
    }

    // Project selector handling
    if (projectSelectorOpen) {
      handleProjectSelectorKeys(e);
      return;
    }

    // Complete linked modal handling
    if (completeLinkedModalOpen) {
      handleCompleteLinkedKeys(e);
      return;
    }

    // Shortcuts modal handling
    if (shortcutsModalOpen) {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        closeShortcutsModal();
      }
      return;
    }

    // Command palette handling
    if (cmdPaletteOpen) {
      handleCommandPaletteKeys(e);
      return;
    }

    // Cmd+K to open command palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openCommandPalette();
      return;
    }

    // Don't handle if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    switch (e.key) {
      case 'J': // Shift+J = Next thread in sidebar
        e.preventDefault();
        navigateNextThread();
        break;

      case 'K': // Shift+K = Previous thread in sidebar
        e.preventDefault();
        navigatePrevThread();
        break;

      case 'j': // Next
        e.preventDefault();
        navigateNext();
        break;

      case 'k': // Previous
        e.preventDefault();
        navigatePrev();
        break;

      case 'ArrowDown':
        e.preventDefault();
        navigateDown();
        break;

      case 'ArrowUp':
        e.preventDefault();
        navigateUp();
        break;

      case 'ArrowRight':
        e.preventDefault();
        if (focusMode === 'threads' && selectedThreadId) {
          focusMode = 'messages';
          focusedMessageIndex = -1; // Start at header
          updateFocus();
        }
        break;

      case 'ArrowLeft':
        e.preventDefault();
        if (focusMode === 'messages') {
          focusMode = 'threads';
          focusedMessageIndex = -1;
          updateFocus();
        }
        break;

      case 'h': // Toggle sidebar
        e.preventDefault();
        toggleSidebar();
        break;

      case 'l': // Switch focus to messages (or expand)
        e.preventDefault();
        if (focusMode === 'threads' && selectedThreadId) {
          focusMode = 'messages';
          focusedMessageIndex = 0;
          updateFocus();
        }
        break;

      case 'o': // Expand/open
        e.preventDefault();
        if (focusMode === 'messages' && focusedMessageIndex >= 0) {
          expandMessage(focusedMessageIndex);
        } else if (focusMode === 'threads' && focusedThreadIndex >= 0) {
          const thread = filteredThreads[focusedThreadIndex];
          if (thread) selectThread(thread.id);
        }
        break;

      case 'c': // Collapse current
        e.preventDefault();
        if (focusMode === 'messages' && focusedMessageIndex >= 0) {
          collapseMessage(focusedMessageIndex);
        }
        break;

      case 'C': // Shift+C = Collapse all
        e.preventDefault();
        collapseAllMessages();
        break;

      case 'e': // Mark current thread as complete and hide
        e.preventDefault();
        if (selectedThreadId) {
          markThreadComplete();
        }
        break;

      case 'E': // Shift+E = Expand all
        e.preventDefault();
        expandAllMessages();
        break;

      case 'p': // Project selector
        e.preventDefault();
        if (selectedThreadId) {
          openProjectSelector();
        }
        break;

      case 'f': // Focus filters
        e.preventDefault();
        focusFilters();
        break;

      case 'r': // Re-tag current thread
        e.preventDefault();
        if (selectedThreadId) {
          retagCurrentThread();
        }
        break;

      case 'x': // Export current thread
        e.preventDefault();
        exportCurrentThread();
        break;

      case 'X': // Shift+X = Export all filtered threads
        e.preventDefault();
        exportAllThreads();
        break;

      case 's': // Stats modal
        e.preventDefault();
        openStatsModal();
        break;

      case 't': // Edit tags for current thread
        e.preventDefault();
        if (selectedThreadId) {
          openTagEditor();
        }
        break;

      case 'u': // Undo last complete
        e.preventDefault();
        undoComplete();
        break;

      case '?': // Show shortcuts
        e.preventDefault();
        openShortcutsModal();
        break;

      case 'Escape':
        if (focusMode === 'messages') {
          focusMode = 'threads';
          focusedMessageIndex = -1;
          updateFocus();
        }
        break;

      case 'Enter':
        e.preventDefault();
        if (focusMode === 'threads' && focusedThreadIndex >= 0) {
          const thread = filteredThreads[focusedThreadIndex];
          if (thread) selectThread(thread.id);
        } else if (focusMode === 'messages' && focusedMessageIndex >= 0) {
          const messages = document.querySelectorAll('.message');
          if (messages[focusedMessageIndex]) {
            toggleMessage(messages[focusedMessageIndex]);
          }
        }
        break;

      case '1':
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          setView('thread');
        }
        break;

      case '2':
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          setView('list');
        }
        break;

      case '3':
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          setView('cards');
        }
        break;

      case '4':
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          setView('kanban');
        }
        break;

      case '/':
        e.preventDefault();
        document.getElementById('sidebar-search').focus();
        break;
    }
  });
}

function handleCommandPaletteKeys(e) {
  switch (e.key) {
    case 'Escape':
      e.preventDefault();
      closeCommandPalette();
      break;

    case 'ArrowDown':
      e.preventDefault();
      cmdSelectedIndex = Math.min(cmdSelectedIndex + 1, cmdResults.length - 1);
      updateCommandSelection();
      break;

    case 'ArrowUp':
      e.preventDefault();
      cmdSelectedIndex = Math.max(cmdSelectedIndex - 1, 0);
      updateCommandSelection();
      break;

    case 'Enter':
      e.preventDefault();
      if (cmdResults[cmdSelectedIndex]) {
        executeCommandResult(cmdResults[cmdSelectedIndex]);
      }
      break;
  }
}

function navigateNext() {
  if (focusMode === 'threads') {
    if (focusedThreadIndex < filteredThreads.length - 1) {
      focusedThreadIndex++;
      updateFocus();
      scrollThreadIntoView();
    }
  } else if (focusMode === 'messages') {
    if (focusedMessageIndex < selectedThreadMessages.length - 1) {
      focusedMessageIndex++;
      updateFocus();
      scrollMessageIntoView();
    }
  }
}

function navigatePrev() {
  if (focusMode === 'threads') {
    if (focusedThreadIndex > 0) {
      focusedThreadIndex--;
      updateFocus();
      scrollThreadIntoView();
    }
  } else if (focusMode === 'messages') {
    if (focusedMessageIndex > 0) {
      focusedMessageIndex--;
      updateFocus();
      scrollMessageIntoView();
    }
  }
}

// Arrow key navigation - includes header area
function navigateDown() {
  if (focusMode === 'threads') {
    if (focusedThreadIndex < filteredThreads.length - 1) {
      focusedThreadIndex++;
      updateFocus();
      scrollThreadIntoView();
    }
  } else if (focusMode === 'messages') {
    // -1 = header, 0+ = messages
    if (focusedMessageIndex < selectedThreadMessages.length - 1) {
      focusedMessageIndex++;
      updateFocus();
      if (focusedMessageIndex >= 0) {
        scrollMessageIntoView();
      }
    }
  }
}

function navigateUp() {
  if (focusMode === 'threads') {
    if (focusedThreadIndex > 0) {
      focusedThreadIndex--;
      updateFocus();
      scrollThreadIntoView();
    }
  } else if (focusMode === 'messages') {
    // Allow going to -1 (header area with link buttons)
    if (focusedMessageIndex > -1) {
      focusedMessageIndex--;
      updateFocus();
      if (focusedMessageIndex >= 0) {
        scrollMessageIntoView();
      } else {
        // Scroll to top of thread content
        document.getElementById('thread-content')?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }
}

// Navigate to next thread in sidebar (Shift+J)
function navigateNextThread() {
  if (focusedThreadIndex < filteredThreads.length - 1) {
    focusedThreadIndex++;
    const thread = filteredThreads[focusedThreadIndex];
    if (thread) {
      selectThread(thread.id);
    }
    updateFocus();
    scrollThreadIntoView();
  }
}

// Navigate to previous thread in sidebar (Shift+K)
function navigatePrevThread() {
  if (focusedThreadIndex > 0) {
    focusedThreadIndex--;
    const thread = filteredThreads[focusedThreadIndex];
    if (thread) {
      selectThread(thread.id);
    }
    updateFocus();
    scrollThreadIntoView();
  }
}

// Mark current thread as complete and move to next
async function markThreadComplete() {
  if (!selectedThreadId) return;

  // Check if there are linked threads
  if (linkedThreads.length > 0) {
    openCompleteLinkedModal();
    return;
  }

  // No linked threads, just mark complete
  await doMarkThreadsComplete([selectedThreadId]);
}

// State for complete linked modal
let completeLinkedModalOpen = false;
let completeLinkedSelected = new Set(); // Selected thread IDs to mark complete

function openCompleteLinkedModal() {
  completeLinkedModalOpen = true;
  completeLinkedSelected = new Set();
  renderCompleteLinkedModal();
  document.getElementById('complete-linked-modal').classList.add('active');
}

function closeCompleteLinkedModal() {
  completeLinkedModalOpen = false;
  document.getElementById('complete-linked-modal').classList.remove('active');
}

function renderCompleteLinkedModal() {
  const modal = document.getElementById('complete-linked-modal');
  if (!modal) return;

  const currentThread = allThreads.find(t => t.id === selectedThreadId);

  const linkedHtml = linkedThreads.map(thread => {
    const isSelected = completeLinkedSelected.has(thread.id);
    return `
      <div class="complete-linked-item ${isSelected ? 'selected' : ''}" data-thread-id="${thread.id}">
        <span class="complete-linked-check">${isSelected ? '☑' : '☐'}</span>
        <span class="thread-item-provider provider-${thread.provider}">${thread.provider}</span>
        <span class="complete-linked-title">${escapeHtml(thread.title || 'Untitled')}</span>
      </div>
    `;
  }).join('');

  modal.innerHTML = `
    <div class="complete-linked-content">
      <div class="complete-linked-header">
        <h3>Mark Complete</h3>
        <p>This thread has ${linkedThreads.length} linked thread${linkedThreads.length > 1 ? 's' : ''}. Mark them complete too?</p>
      </div>
      <div class="complete-linked-current">
        <span class="thread-item-provider provider-${currentThread?.provider}">${currentThread?.provider}</span>
        <span>${escapeHtml(currentThread?.title || 'Untitled')}</span>
        <span class="complete-linked-badge">Current</span>
      </div>
      <div class="complete-linked-list">
        ${linkedHtml}
      </div>
      <div class="complete-linked-actions">
        <button class="btn-secondary" id="complete-none">Just This One</button>
        <button class="btn-secondary" id="complete-select">Selected (${completeLinkedSelected.size})</button>
        <button class="btn-primary" id="complete-all">All ${linkedThreads.length + 1}</button>
      </div>
    </div>
  `;

  // Add event listeners
  modal.querySelectorAll('.complete-linked-item').forEach(el => {
    el.addEventListener('click', () => {
      const threadId = el.dataset.threadId;
      if (completeLinkedSelected.has(threadId)) {
        completeLinkedSelected.delete(threadId);
      } else {
        completeLinkedSelected.add(threadId);
      }
      renderCompleteLinkedModal();
    });
  });

  modal.querySelector('#complete-none').addEventListener('click', async () => {
    closeCompleteLinkedModal();
    await doMarkThreadsComplete([selectedThreadId]);
  });

  modal.querySelector('#complete-select').addEventListener('click', async () => {
    closeCompleteLinkedModal();
    const ids = [selectedThreadId, ...completeLinkedSelected];
    await doMarkThreadsComplete(ids);
  });

  modal.querySelector('#complete-all').addEventListener('click', async () => {
    closeCompleteLinkedModal();
    const ids = [selectedThreadId, ...linkedThreads.map(t => t.id)];
    await doMarkThreadsComplete(ids);
  });
}

function handleCompleteLinkedKeys(e) {
  switch (e.key) {
    case 'Escape':
      e.preventDefault();
      closeCompleteLinkedModal();
      break;
    case '1':
      e.preventDefault();
      document.getElementById('complete-none')?.click();
      break;
    case '2':
      e.preventDefault();
      document.getElementById('complete-select')?.click();
      break;
    case '3':
    case 'Enter':
      e.preventDefault();
      document.getElementById('complete-all')?.click();
      break;
  }
}

async function doMarkThreadsComplete(threadIds) {
  try {
    // Save previous statuses to undo stack
    const previousStatuses = {};
    for (const threadId of threadIds) {
      const thread = allThreads.find(t => t.id === threadId);
      if (thread) {
        previousStatuses[threadId] = thread.status || 'in_progress';
      }
    }
    completedUndoStack.push({ threadIds: [...threadIds], previousStatuses });
    if (completedUndoStack.length > MAX_UNDO_STACK) {
      completedUndoStack.shift();
    }

    // Mark all selected threads complete
    for (const threadId of threadIds) {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_THREAD',
        threadId: threadId,
        updates: { status: 'complete' }
      });
    }

    // Move to next thread before removing from list
    const currentIndex = filteredThreads.findIndex(t => t.id === selectedThreadId);

    // Reload threads (which will filter out complete if filter is active)
    await loadThreads();

    // Select next thread if available
    if (filteredThreads.length > 0) {
      const nextIndex = Math.min(currentIndex, filteredThreads.length - 1);
      focusedThreadIndex = nextIndex;
      const nextThread = filteredThreads[nextIndex];
      if (nextThread) {
        selectThread(nextThread.id);
      }
    } else {
      selectedThreadId = null;
      renderThreadView();
    }
  } catch (err) {
    console.error('Failed to mark threads complete:', err);
  }
}

// Undo last complete action
async function undoComplete() {
  if (completedUndoStack.length === 0) return;

  const { threadIds, previousStatuses } = completedUndoStack.pop();

  try {
    // Restore previous statuses
    for (const threadId of threadIds) {
      const previousStatus = previousStatuses[threadId] || 'in_progress';
      await chrome.runtime.sendMessage({
        type: 'UPDATE_THREAD',
        threadId: threadId,
        updates: { status: previousStatus }
      });
    }

    // Reload threads
    await loadThreads();

    // Select the first restored thread
    if (threadIds.length > 0) {
      selectThread(threadIds[0]);
    }
  } catch (err) {
    console.error('Failed to undo complete:', err);
  }
}

// Focus the filter dropdowns
function focusFilters() {
  const statusFilter = document.getElementById('status-filter');
  if (statusFilter) {
    statusFilter.focus();
  }
}

// Shortcuts modal
function openShortcutsModal() {
  shortcutsModalOpen = true;
  document.getElementById('shortcuts-modal').classList.add('active');
}

function closeShortcutsModal() {
  shortcutsModalOpen = false;
  document.getElementById('shortcuts-modal').classList.remove('active');
}

function setupShortcutsModal() {
  const closeBtn = document.getElementById('shortcuts-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeShortcutsModal);
  }
  const modal = document.getElementById('shortcuts-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeShortcutsModal();
    });
  }
}

function updateFocus() {
  // Update thread focus
  document.querySelectorAll('.thread-item, .list-item, .thread-card').forEach((el, i) => {
    el.classList.toggle('focused', i === focusedThreadIndex && focusMode === 'threads');
  });

  // Update message focus
  document.querySelectorAll('.message').forEach((el, i) => {
    el.classList.toggle('focused', i === focusedMessageIndex && focusMode === 'messages');
  });

  // Update header focus (when focusedMessageIndex === -1)
  const metaHeader = document.querySelector('.thread-meta-header');
  if (metaHeader) {
    metaHeader.classList.toggle('focused', focusedMessageIndex === -1 && focusMode === 'messages');
  }
}

function scrollThreadIntoView() {
  const items = document.querySelectorAll('.thread-item');
  if (items[focusedThreadIndex]) {
    items[focusedThreadIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function scrollMessageIntoView() {
  const messages = document.querySelectorAll('.message');
  if (messages[focusedMessageIndex]) {
    messages[focusedMessageIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
}

function toggleTagsFilterFocus() {
  const tagsSection = document.getElementById('tags-filter-list');
  if (tagsSection) {
    tagsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Flash the tags section to draw attention
    tagsSection.style.outline = '2px solid var(--accent)';
    setTimeout(() => {
      tagsSection.style.outline = '';
    }, 1000);
  }
}

async function retagAllThreads() {
  const btn = document.getElementById('retag-btn');
  const originalText = btn.innerHTML;

  // Create progress overlay
  const overlay = document.createElement('div');
  overlay.id = 'retag-progress-overlay';
  overlay.innerHTML = `
    <div class="retag-progress-modal">
      <h3>🏷️ Re-tagging Threads</h3>
      <div class="retag-progress-bar-container">
        <div class="retag-progress-bar" style="width: 0%"></div>
      </div>
      <div class="retag-progress-text">Starting...</div>
      <div class="retag-progress-current"></div>
    </div>
  `;
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  const modalStyle = overlay.querySelector('.retag-progress-modal');
  modalStyle.style.cssText = `
    background: var(--bg-secondary, #1e1e1e);
    border-radius: 12px;
    padding: 24px 32px;
    min-width: 400px;
    color: var(--text-primary, #fff);
  `;
  const barContainer = overlay.querySelector('.retag-progress-bar-container');
  barContainer.style.cssText = `
    background: var(--bg-tertiary, #333);
    border-radius: 8px;
    height: 8px;
    margin: 16px 0;
    overflow: hidden;
  `;
  const bar = overlay.querySelector('.retag-progress-bar');
  bar.style.cssText = `
    background: var(--accent, #3b82f6);
    height: 100%;
    transition: width 0.3s ease;
  `;
  const progressText = overlay.querySelector('.retag-progress-text');
  progressText.style.cssText = `
    font-size: 14px;
    color: var(--text-secondary, #aaa);
    margin-bottom: 8px;
  `;
  const currentText = overlay.querySelector('.retag-progress-current');
  currentText.style.cssText = `
    font-size: 12px;
    color: var(--text-tertiary, #666);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `;
  document.body.appendChild(overlay);

  // Listen for progress updates
  const progressListener = (message) => {
    if (message.type === 'RETAG_PROGRESS') {
      const percent = Math.round((message.current / message.total) * 100);
      bar.style.width = `${percent}%`;
      progressText.textContent = `${message.current} / ${message.total} (${percent}%)`;
      currentText.textContent = `Processing: ${message.threadTitle}...`;
    }
  };
  chrome.runtime.onMessage.addListener(progressListener);

  try {
    btn.disabled = true;
    btn.classList.add('running');
    btn.innerHTML = '⏳ Re-tagging...';

    const response = await chrome.runtime.sendMessage({ type: 'RETAG_THREADS' });

    chrome.runtime.onMessage.removeListener(progressListener);
    overlay.remove();

    if (response?.success) {
      btn.innerHTML = `✅ Done (${response.succeeded}/${response.total})`;
      // Reload threads to show new tags
      await loadThreads();
      renderCurrentView();

      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.remove('running');
        btn.disabled = false;
      }, 3000);
    } else {
      throw new Error(response?.error || 'Re-tag failed');
    }
  } catch (err) {
    console.error('Re-tag failed:', err);
    chrome.runtime.onMessage.removeListener(progressListener);
    overlay.remove();
    btn.innerHTML = '❌ Failed';
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.classList.remove('running');
      btn.disabled = false;
    }, 3000);
  }
}

async function retagCurrentThread() {
  if (!selectedThreadId) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'RETAG_THREADS',
      threadIds: [selectedThreadId]
    });

    if (response?.success) {
      // Reload to show new tags
      await loadThreads();
      await selectThread(selectedThreadId);
    }
  } catch (err) {
    console.error('Re-tag failed:', err);
  }
}

// ============================================================
// Export Functions
// ============================================================

async function exportCurrentThread() {
  if (!selectedThreadId) {
    alert('Please select a thread to export');
    return;
  }

  const thread = allThreads.find(t => t.id === selectedThreadId);
  if (!thread) return;

  const btn = document.getElementById('export-btn');
  const originalText = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.innerHTML = '⏳ Exporting...';

    // Generate markdown
    const markdown = exportThreadToMarkdown(thread, selectedThreadMessages);
    const filename = generateExportFilename(thread);

    // Download file
    downloadAsFile(markdown, filename);

    btn.innerHTML = '✅ Exported!';
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error('Export failed:', err);
    btn.innerHTML = '❌ Failed';
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }, 2000);
  }
}

async function exportAllThreads() {
  const btn = document.getElementById('export-btn');
  const originalText = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.innerHTML = '⏳ Exporting all...';

    // Fetch messages for each thread
    const threadsWithMessages = [];
    for (const thread of filteredThreads) {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_THREAD',
        threadId: thread.id,
      });
      threadsWithMessages.push({
        thread,
        messages: response?.messages || [],
      });
    }

    // Generate combined markdown
    const markdown = exportThreadsToMarkdown(threadsWithMessages);
    const date = new Date().toISOString().split('T')[0];
    const filename = `ai-thread-hub-export-${date}.md`;

    // Download file
    downloadAsFile(markdown, filename);

    btn.innerHTML = `✅ Exported ${threadsWithMessages.length}!`;
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error('Export failed:', err);
    btn.innerHTML = '❌ Failed';
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }, 2000);
  }
}

// ============================================================
// Stats Modal
// ============================================================

function openStatsModal() {
  statsModalOpen = true;
  document.getElementById('stats-modal').classList.add('active');
  renderStats();
}

function closeStatsModal() {
  statsModalOpen = false;
  document.getElementById('stats-modal').classList.remove('active');
}

// Track chart instances for cleanup
let activityChart = null;
let providerChart = null;
let categoryChart = null;

function renderStats() {
  const container = document.getElementById('stats-content');

  // Calculate stats
  const stats = calculateStats();

  container.innerHTML = `
    <!-- Tabs -->
    <div class="stats-tabs">
      <button class="stats-tab active" data-tab="overview">Overview</button>
      <button class="stats-tab" data-tab="activity">Activity</button>
      <button class="stats-tab" data-tab="providers">Providers</button>
      <button class="stats-tab" data-tab="topics">Topics</button>
    </div>

    <!-- Overview Tab -->
    <div class="stats-tab-content active" id="tab-overview">
      <!-- Summary Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${stats.totalThreads}</div>
          <div class="stat-label">Threads</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.totalMessages.toLocaleString()}</div>
          <div class="stat-label">Messages</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${formatNumber(stats.estimatedTokens)}</div>
          <div class="stat-label">Est. Tokens</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.avgMessagesPerThread}</div>
          <div class="stat-label">Avg Msgs/Thread</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.providers.size}</div>
          <div class="stat-label">Providers</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.uniqueTags}</div>
          <div class="stat-label">Unique Tags</div>
        </div>
      </div>

      <!-- By Provider -->
      <div class="stats-section">
        <h4>Threads by Provider</h4>
        <div class="bar-chart">
          ${renderBarChart(stats.byProvider, stats.totalThreads)}
        </div>
      </div>

      <!-- By Category -->
      <div class="stats-section">
        <h4>Threads by Category</h4>
        <div class="bar-chart">
          ${renderBarChart(stats.byCategory, stats.totalThreads)}
        </div>
      </div>

      <!-- By Status -->
      <div class="stats-section">
        <h4>Threads by Status</h4>
        <div class="bar-chart">
          ${renderBarChart(stats.byStatus, stats.totalThreads)}
        </div>
      </div>

      <!-- Top Tags -->
      <div class="stats-section">
        <h4>Top Tags</h4>
        <div class="bar-chart">
          ${renderBarChart(stats.topTags, stats.totalThreads)}
        </div>
      </div>

      <!-- By Priority -->
      <div class="stats-section">
        <h4>Threads by Priority</h4>
        <div class="bar-chart">
          ${renderBarChart(stats.byPriority, stats.totalThreads)}
        </div>
      </div>
    </div>

    <!-- Activity Tab -->
    <div class="stats-tab-content" id="tab-activity">
      <div class="chart-container">
        <h4>Thread Activity Over Time</h4>
        <div class="chart-controls">
          <select id="activity-period">
            <option value="day">Daily</option>
            <option value="week" selected>Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>
        <div class="chart-wrapper">
          <canvas id="activity-chart"></canvas>
        </div>
      </div>
      <div class="chart-container">
        <h4>Cumulative Growth</h4>
        <div class="chart-wrapper">
          <canvas id="growth-chart"></canvas>
        </div>
      </div>
    </div>

    <!-- Providers Tab -->
    <div class="stats-tab-content" id="tab-providers">
      <div class="chart-container">
        <h4>Provider Usage Over Time</h4>
        <div class="chart-controls">
          <select id="provider-period">
            <option value="week" selected>Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>
        <div class="chart-wrapper">
          <canvas id="provider-chart"></canvas>
        </div>
      </div>
    </div>

    <!-- Topics Tab -->
    <div class="stats-tab-content" id="tab-topics">
      <div class="chart-container">
        <h4>Category Evolution Over Time</h4>
        <div class="chart-controls">
          <select id="category-period">
            <option value="week" selected>Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>
        <div class="chart-wrapper">
          <canvas id="category-chart"></canvas>
        </div>
      </div>
    </div>
  `;

  // Setup tab switching
  setupStatsTabs();
}

function setupStatsTabs() {
  const tabs = document.querySelectorAll('.stats-tab');
  const contents = document.querySelectorAll('.stats-tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      // Update tab states
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update content visibility
      contents.forEach(c => {
        c.classList.remove('active');
        if (c.id === `tab-${targetTab}`) {
          c.classList.add('active');
        }
      });

      // Render charts when their tab becomes active
      if (targetTab === 'activity') {
        renderActivityCharts();
      } else if (targetTab === 'providers') {
        renderProviderChart();
      } else if (targetTab === 'topics') {
        renderCategoryChart();
      }
    });
  });

  // Setup period selectors
  document.getElementById('activity-period')?.addEventListener('change', renderActivityCharts);
  document.getElementById('provider-period')?.addEventListener('change', renderProviderChart);
  document.getElementById('category-period')?.addEventListener('change', renderCategoryChart);
}

function renderActivityCharts() {
  if (typeof Chart === 'undefined' || !window.TrendsModule) {
    console.warn('Chart.js or TrendsModule not loaded');
    return;
  }

  const period = document.getElementById('activity-period')?.value || 'week';
  const { aggregateByTimePeriod, getCumulativeGrowth, PERIOD } = window.TrendsModule;

  // Activity chart
  const activityData = aggregateByTimePeriod(allThreads, 'created_at', period);
  const activityCtx = document.getElementById('activity-chart')?.getContext('2d');

  if (activityCtx) {
    if (activityChart) activityChart.destroy();

    activityChart = new Chart(activityCtx, {
      type: 'line',
      data: {
        labels: activityData.labels,
        datasets: [{
          label: 'New Threads',
          data: activityData.data,
          borderColor: 'rgb(16, 163, 127)',
          backgroundColor: 'rgba(16, 163, 127, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            time: { unit: period === 'day' ? 'day' : period === 'week' ? 'week' : 'month' },
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#8e8e8e' }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#8e8e8e' }
          }
        },
        plugins: {
          legend: { labels: { color: '#b4b4b4' } }
        }
      }
    });
  }

  // Growth chart
  const growthData = getCumulativeGrowth(allThreads, period);
  const growthCtx = document.getElementById('growth-chart')?.getContext('2d');

  if (growthCtx) {
    new Chart(growthCtx, {
      type: 'line',
      data: {
        labels: growthData.labels,
        datasets: [{
          label: 'Total Threads',
          data: growthData.data,
          borderColor: 'rgb(92, 179, 255)',
          backgroundColor: 'rgba(92, 179, 255, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            time: { unit: period === 'day' ? 'day' : period === 'week' ? 'week' : 'month' },
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#8e8e8e' }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#8e8e8e' }
          }
        },
        plugins: {
          legend: { labels: { color: '#b4b4b4' } }
        }
      }
    });
  }
}

function renderProviderChart() {
  if (typeof Chart === 'undefined' || !window.TrendsModule) return;

  const period = document.getElementById('provider-period')?.value || 'week';
  const { aggregateByProviderOverTime, PROVIDER_COLORS } = window.TrendsModule;

  const data = aggregateByProviderOverTime(allThreads, period);
  const ctx = document.getElementById('provider-chart')?.getContext('2d');

  if (!ctx) return;

  if (providerChart) providerChart.destroy();

  const datasets = Object.entries(data.datasets).map(([provider, values]) => ({
    label: provider.charAt(0).toUpperCase() + provider.slice(1),
    data: values,
    borderColor: PROVIDER_COLORS[provider]?.border || 'rgb(150,150,150)',
    backgroundColor: PROVIDER_COLORS[provider]?.bg || 'rgba(150,150,150,0.5)',
    fill: true
  }));

  providerChart = new Chart(ctx, {
    type: 'line',
    data: { labels: data.labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'time',
          time: { unit: period === 'week' ? 'week' : 'month' },
          stacked: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8e8e8e' }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8e8e8e' }
        }
      },
      plugins: {
        legend: { position: 'right', labels: { color: '#b4b4b4' } }
      }
    }
  });
}

function renderCategoryChart() {
  if (typeof Chart === 'undefined' || !window.TrendsModule) return;

  const period = document.getElementById('category-period')?.value || 'week';
  const { aggregateCategoryEvolution, CATEGORY_COLORS } = window.TrendsModule;

  const data = aggregateCategoryEvolution(allThreads, period);
  const ctx = document.getElementById('category-chart')?.getContext('2d');

  if (!ctx) return;

  if (categoryChart) categoryChart.destroy();

  const datasets = Object.entries(data.datasets).map(([category, values]) => ({
    label: category.charAt(0).toUpperCase() + category.slice(1),
    data: values,
    borderColor: CATEGORY_COLORS[category]?.border || 'rgb(150,150,150)',
    backgroundColor: CATEGORY_COLORS[category]?.bg || 'rgba(150,150,150,0.5)',
    fill: true
  }));

  categoryChart = new Chart(ctx, {
    type: 'line',
    data: { labels: data.labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'time',
          time: { unit: period === 'week' ? 'week' : 'month' },
          stacked: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8e8e8e' }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8e8e8e' }
        }
      },
      plugins: {
        legend: { position: 'right', labels: { color: '#b4b4b4' } }
      }
    }
  });
}

function calculateStats() {
  const stats = {
    totalThreads: allThreads.length,
    totalMessages: 0,
    estimatedTokens: 0,
    avgMessagesPerThread: 0,
    providers: new Set(),
    byProvider: new Map(),
    byCategory: new Map(),
    byStatus: new Map(),
    byPriority: new Map(),
    topTags: new Map(),
    uniqueTags: 0,
  };

  const allTagsSet = new Set();

  allThreads.forEach(thread => {
    // Messages count
    const msgCount = thread.message_count || 0;
    stats.totalMessages += msgCount;

    // Estimate tokens (rough: 4 chars = 1 token, based on searchable_content length)
    const contentLength = (thread.searchable_content || '').length;
    stats.estimatedTokens += Math.round(contentLength / 4);

    // By provider
    const provider = thread.provider || 'unknown';
    stats.byProvider.set(provider, (stats.byProvider.get(provider) || 0) + 1);
    stats.providers.add(provider);

    // By category
    const category = thread.category || 'uncategorized';
    stats.byCategory.set(category, (stats.byCategory.get(category) || 0) + 1);

    // By status
    const status = thread.status || 'unknown';
    stats.byStatus.set(status, (stats.byStatus.get(status) || 0) + 1);

    // By priority
    const priority = thread.priority || 'medium';
    stats.byPriority.set(priority, (stats.byPriority.get(priority) || 0) + 1);

    // Tags
    const tags = Array.isArray(thread.tags) ? thread.tags : [];
    tags.forEach(tag => {
      allTagsSet.add(tag);
      stats.topTags.set(tag, (stats.topTags.get(tag) || 0) + 1);
    });
  });

  stats.uniqueTags = allTagsSet.size;
  stats.avgMessagesPerThread = stats.totalThreads > 0
    ? Math.round(stats.totalMessages / stats.totalThreads)
    : 0;

  // Sort topTags and keep top 10
  stats.topTags = new Map(
    [...stats.topTags.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
  );

  return stats;
}

function renderBarChart(dataMap, total) {
  if (dataMap.size === 0) {
    return '<div class="bar-row"><span style="color: var(--text-muted);">No data</span></div>';
  }

  const sorted = [...dataMap.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(...sorted.map(([, v]) => v));

  return sorted.map(([label, value]) => {
    const percent = max > 0 ? (value / max) * 100 : 0;
    const displayLabel = formatLabel(label);
    return `
      <div class="bar-row">
        <span class="bar-label">${escapeHtml(displayLabel)}</span>
        <div class="bar-container">
          <div class="bar-fill" style="width: ${percent}%"></div>
        </div>
        <span class="bar-value">${value}</span>
      </div>
    `;
  }).join('');
}

function formatLabel(label) {
  if (!label) return 'Unknown';
  return label
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// ============================================================
// Kanban Drag and Drop
// ============================================================

function setupKanbanDragDrop() {
  const cards = document.querySelectorAll('.kanban-card');
  const columns = document.querySelectorAll('.kanban-column-cards');

  cards.forEach(card => {
    card.setAttribute('draggable', 'true');

    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.dataset.threadId);
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      columns.forEach(col => col.classList.remove('drag-over'));
    });
  });

  columns.forEach(column => {
    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      column.classList.add('drag-over');
    });

    column.addEventListener('dragleave', () => {
      column.classList.remove('drag-over');
    });

    column.addEventListener('drop', async (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');

      const threadId = e.dataTransfer.getData('text/plain');
      const newStatus = column.closest('.kanban-column').dataset.status;

      if (threadId && newStatus) {
        await updateThreadStatus(threadId, newStatus);
      }
    });
  });
}

async function updateThreadStatus(threadId, newStatus) {
  try {
    // Update thread in storage via message
    await chrome.runtime.sendMessage({
      type: 'UPDATE_THREAD_STATUS',
      threadId,
      status: newStatus,
    });

    // Update local state
    const thread = allThreads.find(t => t.id === threadId);
    if (thread) {
      thread.status = newStatus;
    }

    // Re-render kanban
    renderKanbanView();
  } catch (err) {
    console.error('Failed to update status:', err);
  }
}

// ============================================================
// Event Listeners
// ============================================================

function setupEventListeners() {
  // Sidebar toggle
  document.getElementById('toggle-sidebar').addEventListener('click', toggleSidebar);

  // View toggles
  document.querySelectorAll('.view-toggle').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  // Re-tag button
  document.getElementById('retag-btn').addEventListener('click', retagAllThreads);

  // Export button - click exports current, shift+click exports all
  document.getElementById('export-btn').addEventListener('click', (e) => {
    if (e.shiftKey) {
      exportAllThreads();
    } else {
      exportCurrentThread();
    }
  });

  // Settings button - opens extension options page
  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Search
  let searchDebounce;
  document.getElementById('sidebar-search').addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      loadThreads();
      updateClearFiltersState();
    }, 300);
  });

  // Filters
  document.getElementById('provider-filter').addEventListener('change', () => {
    loadThreads();
    updateClearFiltersState();
  });
  document.getElementById('sort-filter').addEventListener('change', () => {
    applyFiltersAndSort();
    renderCurrentView();
  });
  document.getElementById('category-filter').addEventListener('change', () => {
    applyFiltersAndSort();
    renderCurrentView();
    updateClearFiltersState();
  });
  document.getElementById('status-filter').addEventListener('change', () => {
    applyFiltersAndSort();
    renderCurrentView();
    updateClearFiltersState();
  });

  // Project filter
  document.getElementById('project-filter').addEventListener('change', (e) => {
    filterByProject(e.target.value);
    updateClearFiltersState();
  });

  // Clear all filters button
  document.getElementById('clear-all-filters').addEventListener('click', clearAllFilters);

  // Clear tags filter button
  document.getElementById('clear-tags-filter').addEventListener('click', () => {
    selectedTags.clear();
    applyFiltersAndSort();
    renderCurrentView();
    updateClearFiltersState();
  });

  // Grouping
  document.getElementById('group-by').addEventListener('change', (e) => {
    currentGroupBy = e.target.value;
    renderCurrentView();
  });

  // Command palette
  document.getElementById('cmd-palette').addEventListener('click', (e) => {
    if (e.target.id === 'cmd-palette') {
      closeCommandPalette();
    }
  });

  document.getElementById('cmd-input').addEventListener('input', (e) => {
    cmdSelectedIndex = 0;
    renderCommandResults(e.target.value);
  });

  // Cmd+K hint click
  document.querySelector('.cmd-k-hint').addEventListener('click', openCommandPalette);

  // Link modal
  document.getElementById('link-modal').addEventListener('click', (e) => {
    if (e.target.id === 'link-modal') {
      closeLinkModal();
    }
  });

  document.getElementById('link-modal-close').addEventListener('click', closeLinkModal);

  // Stats modal
  document.getElementById('stats-modal').addEventListener('click', (e) => {
    if (e.target.id === 'stats-modal') {
      closeStatsModal();
    }
  });

  document.getElementById('stats-modal-close').addEventListener('click', closeStatsModal);

  let linkSearchDebounce;
  document.getElementById('link-search').addEventListener('input', (e) => {
    clearTimeout(linkSearchDebounce);
    linkSearchDebounce = setTimeout(() => {
      renderLinkSearchResults(e.target.value);
    }, 200);
  });

  // Validation modal
  setupValidationModal();
}

// ============================================================
// Utilities
// ============================================================

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'never';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function getSyncStatus(dateStr) {
  if (!dateStr) {
    return { class: 'old', tooltip: 'Never synced' };
  }
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  const hours = diff / 3600000;
  const days = diff / 86400000;

  if (hours < 24) {
    return { class: 'synced', tooltip: 'Synced within 24 hours' };
  }
  if (days < 7) {
    return { class: 'stale', tooltip: `Synced ${Math.floor(days)} days ago` };
  }
  return { class: 'old', tooltip: `Synced ${Math.floor(days)} days ago - may need refresh` };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getThreadPreview(thread, maxLength = 200) {
  // Try searchable_content first (usually has the conversation summary)
  let preview = thread.searchable_content || thread.ai_summary || '';
  if (!preview && thread.messages?.length) {
    // Get first assistant message
    const assistantMsg = thread.messages.find(m => m.role === 'assistant');
    preview = assistantMsg?.content || thread.messages[0]?.content || '';
  }
  // Clean and truncate
  preview = preview.replace(/\s+/g, ' ').trim();
  if (preview.length > maxLength) {
    preview = preview.substring(0, maxLength) + '...';
  }
  return preview || 'No preview available';
}

function processMessageText(text) {
  // Convert markdown to HTML
  let processed = escapeHtml(text);

  // Code blocks with language (must be before other processing)
  processed = processed.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code class="language-${lang || ''}">${code.trim()}</code></pre>`;
  });

  // Inline code
  processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers (must process before newlines)
  processed = processed.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  processed = processed.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  processed = processed.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // Bold and italic
  processed = processed.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  processed = processed.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>');
  processed = processed.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  processed = processed.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Links [text](url)
  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Horizontal rules
  processed = processed.replace(/^---+$/gm, '<hr>');

  // Unordered lists (simple)
  processed = processed.replace(/^[-*] (.+)$/gm, '<li>$1</li>');

  // Numbered lists (simple)
  processed = processed.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Wrap consecutive <li> in <ul>
  processed = processed.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Preserve newlines
  processed = processed.replace(/\n/g, '<br>');

  // Clean up extra <br> after block elements
  processed = processed.replace(/<\/(h[2-4]|pre|ul|hr)><br>/g, '</$1>');
  processed = processed.replace(/<br><(h[2-4]|pre|ul|hr)/g, '<$1');

  return processed;
}

// ============================================================
// Attachment Type Icons
// ============================================================

/**
 * Generate attachment badges HTML for a thread
 * @param {string[]} types - Array of attachment types
 * @returns {string} HTML string with badges
 */
function getAttachmentBadgesHtml(types = []) {
  if (!types || types.length === 0) return '';

  return types.map(type => {
    const icon = getIcon(type, { size: 14 });
    return `<span class="attachment-badge attachment-${type}" title="${type}" data-type="${type}">${icon}</span>`;
  }).join('');
}

/**
 * Setup listeners for attachment filter badges
 * Clicking a badge filters messages to show only those with that attachment type
 */
function setupAttachmentFilterListeners() {
  // Clear filter button
  const clearBtn = document.getElementById('clear-attachment-filter');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      activeAttachmentFilter = null;
      clearBtn.style.display = 'none';
      // Remove active class from all badges
      document.querySelectorAll('.thread-attachments-section .attachment-badge').forEach(badge => {
        badge.classList.remove('active');
      });
      renderMessages();
    });
  }

  // Attachment badges click
  document.querySelectorAll('.thread-attachments-section .attachment-badge').forEach(badge => {
    badge.addEventListener('click', () => {
      const type = badge.dataset.type;

      // Toggle filter
      if (activeAttachmentFilter === type) {
        // Clear filter
        activeAttachmentFilter = null;
        badge.classList.remove('active');
        if (clearBtn) clearBtn.style.display = 'none';
      } else {
        // Set filter
        activeAttachmentFilter = type;
        // Remove active from all, add to current
        document.querySelectorAll('.thread-attachments-section .attachment-badge').forEach(b => {
          b.classList.remove('active');
        });
        badge.classList.add('active');
        if (clearBtn) clearBtn.style.display = 'inline-block';
      }

      renderMessages();
    });
  });
}

/**
 * Check if a message contains content matching the attachment type
 */
function messageMatchesAttachmentType(text, type) {
  if (!text || !type) return false;

  const patterns = {
    code: [
      /```[\w-]*\n/,
      /\bfunction\s+\w+\s*\(/,
      /\bconst\s+\w+\s*=/,
      /\bdef\s+\w+\s*\(/,
      /\bclass\s+\w+/,
    ],
    html: [
      /<!DOCTYPE\s+html/i,
      /<html[\s>]/i,
      /<body[\s>]/i,
      /<div[\s>]/i,
    ],
    doc: [
      /^#{1,6}\s+.+$/m,
      /^\s*[-*]\s+.+$/m,
      /^\s*\d+\.\s+.+$/m,
    ],
    image: [
      /\[Image:/i,
      /!\[.*?\]\(.*?\)/,
      /data:image\//,
    ],
    data: [
      /^\s*\{[\s\S]*"[\w]+"\s*:/m,
      /^\s*\[[\s\S]*\{/m,
    ],
  };

  const typePatterns = patterns[type] || [];
  return typePatterns.some(p => p.test(text));
}

/**
 * Detect all attachment types present in a single message
 * @param {string} text - Message text
 * @returns {string[]} Array of detected types
 */
function detectMessageAttachmentTypes(text) {
  if (!text) return [];

  const types = [];
  const allTypes = ['code', 'html', 'image', 'data', 'doc'];

  for (const type of allTypes) {
    if (messageMatchesAttachmentType(text, type)) {
      types.push(type);
    }
  }

  return types;
}

/**
 * Generate attachment badges HTML for a single message
 * @param {string[]} types - Array of attachment types
 * @param {string} threadUrl - URL to open thread (for image links)
 * @returns {string} HTML string
 */
function getMessageAttachmentBadgesHtml(types, threadUrl) {
  if (!types || types.length === 0) return '';

  return types.map(type => {
    const icon = getIcon(type, { size: 12 });
    if (type === 'image' && threadUrl) {
      return `<a href="${escapeHtml(threadUrl)}" target="_blank" class="message-attachment-badge attachment-${type}" title="Open thread with image">${icon}</a>`;
    }
    return `<span class="message-attachment-badge attachment-${type}" title="${type}">${icon}</span>`;
  }).join('');
}

// ============================================================
// Validation Modal
// ============================================================

function openValidationModal() {
  validationModalOpen = true;
  document.getElementById('validation-modal').classList.add('active');
  loadValidationStats();
  loadValidationResults();
  checkAuditStatus();
}

function closeValidationModal() {
  validationModalOpen = false;
  document.getElementById('validation-modal').classList.remove('active');
}

async function loadValidationStats() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_VALIDATION_STATS' });
    if (response?.success) {
      const stats = response.stats;
      document.getElementById('val-total').textContent = stats.total || 0;
      document.getElementById('val-unvalidated').textContent = stats.unvalidated || 0;
      document.getElementById('val-valid').textContent = stats.valid || 0;
      document.getElementById('val-suspicious').textContent = stats.suspicious || 0;
      document.getElementById('val-mismatch').textContent = stats.mismatch || 0;
    }

    // Also load hidden count
    const hiddenResponse = await chrome.runtime.sendMessage({ type: 'GET_HIDDEN_THREADS' });
    if (hiddenResponse?.success) {
      document.getElementById('val-hidden').textContent = hiddenResponse.threads?.length || 0;
    }
  } catch (err) {
    console.error('Failed to load validation stats:', err);
  }
}

async function loadValidationResults() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_THREADS_WITH_ISSUES',
      options: { limit: 100 }
    });

    const tbody = document.getElementById('validation-tbody');
    if (!response?.success || !response.threads?.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No validation issues found. Run an audit to check threads.</td></tr>';
      return;
    }

    tbody.innerHTML = response.threads.map(thread => {
      const statusClass = getValidationStatusClass(thread.validation_status);
      const flags = thread.validation_flags?.join(', ') || '-';
      return `
        <tr data-thread-id="${thread.id}">
          <td class="val-thread-title" title="${escapeHtml(thread.title || 'Untitled')}">${escapeHtml(truncate(thread.title || 'Untitled', 40))}</td>
          <td><span class="provider-badge ${thread.provider}">${thread.provider}</span></td>
          <td>${thread.message_count || 0}</td>
          <td>${thread.validation_message_count ?? '-'}</td>
          <td><span class="val-status ${statusClass}">${thread.validation_status || 'unvalidated'}</span></td>
          <td class="val-flags">${flags}</td>
          <td>
            <button class="val-action-btn" onclick="resyncThread('${thread.id}')" title="Re-sync this thread">🔄</button>
            <button class="val-action-btn" onclick="openThreadExternal('${thread.provider}', '${thread.provider_thread_id}', '${escapeHtml(thread.url || '')}')" title="View in provider">↗️</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load validation results:', err);
  }
}

function getValidationStatusClass(status) {
  switch (status) {
    case 'valid': return 'valid';
    case 'suspicious': return 'suspicious';
    case 'mismatch': return 'mismatch';
    default: return 'unvalidated';
  }
}

function truncate(str, maxLength) {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

async function checkAuditStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_VALIDATION_AUDIT_STATUS' });
    if (response?.running) {
      validationAuditRunning = true;
      updateAuditUI(true, response.progress);
    } else {
      validationAuditRunning = false;
      updateAuditUI(false);
    }
  } catch (err) {
    console.error('Failed to check audit status:', err);
  }
}

function updateAuditUI(running, progress = null) {
  const startBtn = document.getElementById('validation-start');
  const stopBtn = document.getElementById('validation-stop');
  const progressContainer = document.getElementById('validation-progress');
  const progressBar = document.getElementById('validation-progress-fill');
  const progressText = document.getElementById('validation-progress-text');

  if (running) {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    progressContainer.style.display = 'block';

    if (progress) {
      const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
      progressBar.style.width = `${percent}%`;
      progressText.textContent = `${progress.current} / ${progress.total} (${progress.valid} valid, ${progress.suspicious} suspicious, ${progress.mismatch} mismatch)`;
    }
  } else {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    progressContainer.style.display = 'none';
  }
}

async function startValidationAudit() {
  const provider = document.getElementById('validation-provider').value || undefined;
  const limit = parseInt(document.getElementById('validation-limit').value) || 50;
  const delay = parseInt(document.getElementById('validation-delay').value) || 60;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'START_VALIDATION_AUDIT',
      options: { providers: provider ? [provider] : undefined, limit, delayBetweenMs: delay * 1000 }
    });

    if (response?.success) {
      validationAuditRunning = true;
      updateAuditUI(true, { current: 0, total: response.queuedCount || 0, valid: 0, suspicious: 0, mismatch: 0 });
    } else {
      alert('Failed to start audit: ' + (response?.error || 'Unknown error'));
    }
  } catch (err) {
    console.error('Failed to start audit:', err);
    alert('Failed to start audit: ' + err.message);
  }
}

async function stopValidationAudit() {
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_VALIDATION_AUDIT' });
    validationAuditRunning = false;
    updateAuditUI(false);
    loadValidationStats();
    loadValidationResults();
  } catch (err) {
    console.error('Failed to stop audit:', err);
  }
}

async function clearValidationData() {
  if (!confirm('Clear all validation data? This will reset all threads to unvalidated status.')) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ type: 'CLEAR_VALIDATION_STATUS' });
    loadValidationStats();
    loadValidationResults();
  } catch (err) {
    console.error('Failed to clear validation data:', err);
  }
}

async function resyncThread(threadId) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'RESYNC_THREAD', threadId });
    if (response?.success) {
      // Refresh the results
      loadValidationStats();
      loadValidationResults();
    } else {
      alert('Failed to queue resync: ' + (response?.error || 'Unknown error'));
    }
  } catch (err) {
    console.error('Failed to resync thread:', err);
  }
}

function openThreadExternal(provider, providerThreadId, existingUrl) {
  const url = buildProviderUrl(provider, providerThreadId, existingUrl);
  if (url) {
    window.open(url, '_blank');
  }
}

// Listen for validation progress updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'VALIDATION_PROGRESS' && validationModalOpen) {
    updateAuditUI(true, message.progress);

    // Refresh stats periodically during audit
    if (message.progress.current % 5 === 0) {
      loadValidationStats();
    }
  }

  if (message.type === 'VALIDATION_COMPLETE' && validationModalOpen) {
    validationAuditRunning = false;
    updateAuditUI(false);
    loadValidationStats();
    loadValidationResults();
  }
});

// Setup validation modal event listeners (called from setupEventListeners)
function setupValidationModal() {
  document.getElementById('validate-btn')?.addEventListener('click', openValidationModal);
  document.getElementById('validation-close')?.addEventListener('click', closeValidationModal);
  document.getElementById('validation-start')?.addEventListener('click', startValidationAudit);
  document.getElementById('validation-stop')?.addEventListener('click', stopValidationAudit);
  document.getElementById('validation-clear')?.addEventListener('click', clearValidationData);

  // Tab switching
  document.querySelectorAll('.validation-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      switchValidationTab(tabId);
    });
  });

  // Duplicate detection
  document.getElementById('find-duplicates-btn')?.addEventListener('click', findDuplicates);
  document.getElementById('auto-hide-duplicates-btn')?.addEventListener('click', autoHideAllDuplicates);
  document.getElementById('delete-empty-btn')?.addEventListener('click', deleteEmptyThreads);

  // Hidden threads
  document.getElementById('refresh-hidden-btn')?.addEventListener('click', loadHiddenThreads);

  // Close modal on backdrop click
  document.getElementById('validation-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'validation-modal') {
      closeValidationModal();
    }
  });
}

function switchValidationTab(tabId) {
  // Update tab buttons
  document.querySelectorAll('.validation-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabId);
  });

  // Update tab content
  document.querySelectorAll('.validation-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabId}`);
  });

  // Load data for the selected tab
  if (tabId === 'hidden') {
    loadHiddenThreads();
  }
}

async function findDuplicates() {
  const resultsDiv = document.getElementById('duplicates-results');
  resultsDiv.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Scanning for duplicates...</p>';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'FIND_DUPLICATES' });

    if (!response?.success) {
      resultsDiv.innerHTML = `<p style="color: #ef4444; text-align: center;">Error: ${response?.error || 'Unknown error'}</p>`;
      return;
    }

    const groups = response.duplicateGroups || [];

    // Update stats
    document.getElementById('val-duplicates').textContent = groups.reduce((sum, g) => sum + g.duplicates.length, 0);

    if (groups.length === 0) {
      resultsDiv.innerHTML = '<p style="color: #22c55e; text-align: center;">No duplicates found!</p>';
      return;
    }

    resultsDiv.innerHTML = groups.map(group => `
      <div class="duplicate-group">
        <div class="duplicate-group-header">
          <h4>${escapeHtml(truncate(group.original.title || 'Untitled', 50))}</h4>
          <span class="duplicate-group-count">${group.count} threads</span>
        </div>
        <div class="duplicate-item original">
          <span class="duplicate-item-title">
            <span class="provider-badge ${group.original.provider}">${group.original.provider}</span>
            ${escapeHtml(group.original.title || 'Untitled')}
          </span>
          <span class="duplicate-item-meta">${group.original._messageCount} msgs - KEEP</span>
        </div>
        ${group.duplicates.map(dupe => `
          <div class="duplicate-item dupe" data-thread-id="${dupe.id}">
            <span class="duplicate-item-title">
              <span class="provider-badge ${dupe.provider}">${dupe.provider}</span>
              ${escapeHtml(dupe.title || 'Untitled')}
            </span>
            <span class="duplicate-item-meta">${dupe._messageCount} msgs</span>
            <button class="val-action-btn" onclick="hideThreadAsDuplicate('${dupe.id}', '${group.original.id}')" title="Hide this duplicate">Hide</button>
          </div>
        `).join('')}
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to find duplicates:', err);
    resultsDiv.innerHTML = `<p style="color: #ef4444; text-align: center;">Error: ${err.message}</p>`;
  }
}

async function autoHideAllDuplicates() {
  if (!confirm('This will hide all duplicate threads, keeping only the newest version of each. Continue?')) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: 'AUTO_HIDE_DUPLICATES' });

    if (response?.success) {
      alert(`Hidden ${response.hiddenCount} duplicate threads across ${response.groupCount} groups.`);
      loadValidationStats();
      findDuplicates(); // Refresh the list
      loadHiddenThreads();
    } else {
      alert('Failed to hide duplicates: ' + (response?.error || 'Unknown error'));
    }
  } catch (err) {
    console.error('Failed to auto-hide duplicates:', err);
    alert('Failed to hide duplicates: ' + err.message);
  }
}

async function deleteEmptyThreads() {
  if (!confirm('This will permanently delete all threads with 0 messages. This cannot be undone. Continue?')) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: 'DELETE_EMPTY_THREADS' });

    if (response?.success) {
      alert(`Deleted ${response.deleted} empty threads.`);
      loadValidationStats();
      findDuplicates(); // Refresh the duplicates list
      loadThreads(); // Refresh main thread list
    } else {
      alert('Failed to delete empty threads: ' + (response?.error || 'Unknown error'));
    }
  } catch (err) {
    console.error('Failed to delete empty threads:', err);
    alert('Failed to delete empty threads: ' + err.message);
  }
}

async function hideThreadAsDuplicate(threadId, originalId) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'HIDE_THREAD',
      threadId,
      reason: 'duplicate',
      duplicateOf: originalId
    });

    if (response?.success) {
      // Remove from UI
      const item = document.querySelector(`.duplicate-item[data-thread-id="${threadId}"]`);
      if (item) {
        item.remove();
      }
      loadValidationStats();
    } else {
      alert('Failed to hide thread: ' + (response?.error || 'Unknown error'));
    }
  } catch (err) {
    console.error('Failed to hide thread:', err);
  }
}

async function loadHiddenThreads() {
  const tbody = document.getElementById('hidden-tbody');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_HIDDEN_THREADS' });

    if (!response?.success || !response.threads?.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No hidden threads.</td></tr>';
      document.getElementById('val-hidden').textContent = '0';
      return;
    }

    document.getElementById('val-hidden').textContent = response.threads.length;

    tbody.innerHTML = response.threads.map(thread => `
      <tr data-thread-id="${thread.id}">
        <td class="val-thread-title" title="${escapeHtml(thread.title || 'Untitled')}">${escapeHtml(truncate(thread.title || 'Untitled', 40))}</td>
        <td><span class="provider-badge ${thread.provider}">${thread.provider}</span></td>
        <td>${thread.hidden_reason || 'manual'}</td>
        <td>${formatRelativeTime(thread.hidden_at)}</td>
        <td>
          <button class="val-action-btn" onclick="unhideThread('${thread.id}')" title="Restore this thread">Restore</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load hidden threads:', err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #ef4444;">Error loading hidden threads</td></tr>';
  }
}

async function unhideThread(threadId) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'UNHIDE_THREAD', threadId });

    if (response?.success) {
      loadHiddenThreads();
      loadValidationStats();
    } else {
      alert('Failed to restore thread: ' + (response?.error || 'Unknown error'));
    }
  } catch (err) {
    console.error('Failed to unhide thread:', err);
  }
}
