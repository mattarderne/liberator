import { saveCustomColumns, getCustomColumns, saveApiKey, getApiKey, initDatabase, getSelectedDatabase, setSelectedDatabase } from '../storage.js';

// Default Obsidian config
const DEFAULT_OBSIDIAN_CONFIG = {
  enabled: false,
  method: 'obsidian-rest-api',
  apiEndpoint: 'https://127.0.0.1:27124',
  apiKey: '',
  targetFolder: 'AI Threads',
  folderStructure: 'by-provider',
  includeMessages: 'summary-only',
  syncIntervalMinutes: 30,
};

async function init() {
  try {
    // Initialize database first
    await initDatabase();

    const apiKey = await getApiKey();
    document.getElementById('api-key').value = apiKey || '';

    const columns = await getCustomColumns();
    if (columns?.length) {
      document.getElementById('custom-columns').value = JSON.stringify(columns, null, 2);
    }

    // Initialize database selector UI
    await initDatabaseSelector();

    // Initialize Claude Code import UI
    await initClaudeCodeImport();

    // Initialize Obsidian sync UI
    await initObsidianSync();

    // Initialize maintenance UI
    initMaintenanceUI();

    // Initialize appearance settings
    initAppearanceSettings();
  } catch (err) {
    console.error('Failed to load settings:', err);
    setStatus('Failed to load settings', 'error');
  }
}

async function initDatabaseSelector() {
  const select = document.getElementById('database-select');
  const seedBtn = document.getElementById('seed-demo-data');
  const clearBtn = document.getElementById('clear-demo-data');
  const statsEl = document.getElementById('demo-stats');

  // Load current state
  const currentDb = getSelectedDatabase();
  select.value = currentDb;
  updateDemoControls(currentDb);

  // Database change handler
  select.addEventListener('change', async () => {
    const selected = select.value;
    await setSelectedDatabase(selected);
    updateDemoControls(selected);
    setStatus(`Database switched to ${selected}. Refresh other pages to see changes.`, 'success');
  });

  // Seed data handler (only for demo database)
  seedBtn.addEventListener('click', async () => {
    try {
      setStatus('Generating demo data...', 'success');
      const demoData = generateDemoDataInline();
      const stats = await seedDemoDatabase(demoData);
      statsEl.innerHTML = `Seeded: ${stats.threadsInserted} threads, ${stats.messagesInserted} messages`;
      setStatus('Demo data seeded successfully!', 'success');
    } catch (err) {
      console.error('Failed to seed demo data:', err);
      setStatus(`Failed to seed demo data: ${err.message}`, 'error');
    }
  });

  // Clear data handler
  clearBtn.addEventListener('click', async () => {
    if (!confirm('Clear all demo data? This cannot be undone.')) return;
    try {
      await clearDemoDatabase();
      statsEl.innerHTML = '';
      setStatus('Demo data cleared.', 'success');
    } catch (err) {
      console.error('Failed to clear demo data:', err);
      setStatus(`Failed to clear demo data: ${err.message}`, 'error');
    }
  });

  function updateDemoControls(dbChoice) {
    const controls = document.getElementById('demo-controls');
    controls.style.display = dbChoice === 'demo' ? 'block' : 'none';
  }
}

/**
 * Initialize Claude Code Import UI
 */
async function initClaudeCodeImport() {
  const importBtn = document.getElementById('import-claude-code');
  const checkHostBtn = document.getElementById('check-native-host');
  const statusEl = document.getElementById('claude-code-status');
  const nativeHostSection = document.getElementById('native-host-section');
  const nativeHostStatus = document.getElementById('native-host-status');
  const autoSyncCheckbox = document.getElementById('auto-sync-claude-code');
  const autoSyncSettings = document.getElementById('auto-sync-settings');
  const intervalInput = document.getElementById('claude-code-interval');
  const syncNowBtn = document.getElementById('sync-now-claude-code');

  // Load saved config
  const config = await getClaudeCodeConfig();
  autoSyncCheckbox.checked = config.autoSyncEnabled;
  intervalInput.value = config.syncIntervalMinutes;
  if (config.autoSyncEnabled) {
    autoSyncSettings.style.display = 'block';
  }

  // Manual import via file picker
  importBtn.addEventListener('click', async () => {
    try {
      statusEl.textContent = 'Select your ~/.claude folder...';
      statusEl.className = 'status';

      // Use File System Access API if available
      if ('showDirectoryPicker' in window) {
        const dirHandle = await window.showDirectoryPicker({
          id: 'claude-code-import',
          startIn: 'documents',
        });

        statusEl.textContent = 'Scanning for sessions...';
        const sessions = await scanDirectoryForSessions(dirHandle);

        if (sessions.length === 0) {
          statusEl.textContent = 'No Claude Code sessions found in selected folder.';
          statusEl.className = 'status error';
          return;
        }

        statusEl.textContent = `Found ${sessions.length} sessions. Importing...`;

        // Send to background for processing
        const result = await chrome.runtime.sendMessage({
          type: 'IMPORT_CLI_BATCH',
          sessions,
        });

        if (result.success) {
          statusEl.textContent = `Imported ${result.imported} sessions (${result.skipped} already existed)`;
          statusEl.className = 'status success';
        } else {
          statusEl.textContent = `Import failed: ${result.error}`;
          statusEl.className = 'status error';
        }
      } else {
        statusEl.textContent = 'File System Access API not supported. Use native host for automatic sync.';
        statusEl.className = 'status error';
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        statusEl.textContent = '';
        statusEl.className = 'status';
      } else {
        statusEl.textContent = `Error: ${err.message}`;
        statusEl.className = 'status error';
      }
    }
  });

  // Check native host status
  checkHostBtn.addEventListener('click', async () => {
    statusEl.textContent = 'Checking native host...';
    statusEl.className = 'status';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'NATIVE_CLI_SYNC',
        action: 'status',
      });

      if (response.success) {
        nativeHostSection.style.display = 'block';
        const status = response.data;
        nativeHostStatus.innerHTML = `
          <div><strong>Claude directory:</strong> ${status.claudeDirExists ? '✓' : '✗'} ${status.claudeDir}</div>
          <div><strong>Projects directory:</strong> ${status.projectsDirExists ? '✓' : '✗'} ${status.projectsDir}</div>
          <div><strong>Session files found:</strong> ${status.totalFiles}</div>
          <div><strong>Projects found:</strong> ${status.totalProjects}</div>
          ${status.lastSyncTime ? `<div><strong>Last sync:</strong> ${new Date(status.lastSyncTime).toLocaleString()}</div>` : ''}
        `;
        statusEl.textContent = 'Native host connected!';
        statusEl.className = 'status success';
      } else {
        nativeHostSection.style.display = 'none';
        statusEl.textContent = `Native host not available: ${response.error}`;
        statusEl.className = 'status error';
      }
    } catch (err) {
      nativeHostSection.style.display = 'none';
      statusEl.textContent = `Native host not installed. See setup instructions below.`;
      statusEl.className = 'status error';
    }
  });

  // Auto-sync toggle
  autoSyncCheckbox.addEventListener('change', async () => {
    autoSyncSettings.style.display = autoSyncCheckbox.checked ? 'block' : 'none';
    await saveClaudeCodeConfig({
      ...config,
      autoSyncEnabled: autoSyncCheckbox.checked,
    });

    // Notify background to update alarm
    chrome.runtime.sendMessage({
      type: 'CLAUDE_CODE_CONFIG_CHANGED',
      config: {
        autoSyncEnabled: autoSyncCheckbox.checked,
        syncIntervalMinutes: parseInt(intervalInput.value, 10) || 5,
      },
    }).catch(() => {});
  });

  // Interval change
  intervalInput.addEventListener('change', async () => {
    const newConfig = {
      autoSyncEnabled: autoSyncCheckbox.checked,
      syncIntervalMinutes: parseInt(intervalInput.value, 10) || 5,
    };
    await saveClaudeCodeConfig(newConfig);

    chrome.runtime.sendMessage({
      type: 'CLAUDE_CODE_CONFIG_CHANGED',
      config: newConfig,
    }).catch(() => {});
  });

  // Sync now button
  syncNowBtn.addEventListener('click', async () => {
    statusEl.textContent = 'Syncing...';
    statusEl.className = 'status';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'NATIVE_CLI_SYNC',
        action: 'sync',
        force: true,
      });

      if (response.success) {
        const result = response.data;
        statusEl.textContent = `Synced ${result.synced || 0} sessions (${result.total - (result.synced || 0)} unchanged)`;
        statusEl.className = 'status success';
      } else {
        statusEl.textContent = `Sync failed: ${response.error}`;
        statusEl.className = 'status error';
      }
    } catch (err) {
      statusEl.textContent = `Sync error: ${err.message}`;
      statusEl.className = 'status error';
    }
  });
}

/**
 * Scan directory for Claude Code session files
 */
async function scanDirectoryForSessions(dirHandle) {
  const sessions = [];

  async function scanRecursive(handle, pathParts = []) {
    for await (const entry of handle.values()) {
      if (entry.kind === 'directory') {
        const subHandle = await handle.getDirectoryHandle(entry.name);
        await scanRecursive(subHandle, [...pathParts, entry.name]);
      } else if (entry.kind === 'file' && entry.name.endsWith('.jsonl') && !entry.name.startsWith('.')) {
        try {
          const file = await entry.getFile();
          const content = await file.text();
          const filePath = [...pathParts, entry.name].join('/');
          sessions.push({ path: filePath, content });
        } catch (err) {
          console.warn(`Could not read ${entry.name}:`, err);
        }
      }
    }
  }

  // Look for projects subdirectory
  try {
    const projectsHandle = await dirHandle.getDirectoryHandle('projects');
    await scanRecursive(projectsHandle, ['projects']);
  } catch {
    // No projects folder, scan root
    await scanRecursive(dirHandle);
  }

  return sessions;
}

/**
 * Get Claude Code config from storage
 */
async function getClaudeCodeConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get('claudeCode', (result) => {
      resolve({
        autoSyncEnabled: false,
        syncIntervalMinutes: 5,
        ...result.claudeCode,
      });
    });
  });
}

/**
 * Save Claude Code config to storage
 */
async function saveClaudeCodeConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ claudeCode: config }, resolve);
  });
}

/**
 * Initialize Obsidian Sync UI
 */
async function initObsidianSync() {
  const enabledCheckbox = document.getElementById('obsidian-enabled');
  const settingsDiv = document.getElementById('obsidian-settings');
  const methodSelect = document.getElementById('obsidian-method');
  const restApiSettings = document.getElementById('rest-api-settings');
  const endpointInput = document.getElementById('obsidian-endpoint');
  const apiKeyInput = document.getElementById('obsidian-api-key');
  const intervalInput = document.getElementById('obsidian-interval');
  const folderInput = document.getElementById('obsidian-folder');
  const structureSelect = document.getElementById('obsidian-structure');
  const messagesSelect = document.getElementById('obsidian-messages');
  const testBtn = document.getElementById('test-obsidian');
  const testResult = document.getElementById('obsidian-test-result');

  // Load saved config
  const config = await getObsidianConfig();
  enabledCheckbox.checked = config.enabled;
  methodSelect.value = config.method;
  endpointInput.value = config.apiEndpoint;
  apiKeyInput.value = config.apiKey;
  intervalInput.value = config.syncIntervalMinutes;
  folderInput.value = config.targetFolder;
  structureSelect.value = config.folderStructure;
  messagesSelect.value = config.includeMessages;

  // Update visibility
  updateSettingsVisibility();
  updateRestApiVisibility();

  // Event listeners
  enabledCheckbox.addEventListener('change', updateSettingsVisibility);
  methodSelect.addEventListener('change', updateRestApiVisibility);

  testBtn.addEventListener('click', async () => {
    testResult.textContent = 'Testing connection...';
    testResult.className = 'status';

    try {
      const endpoint = endpointInput.value.trim().replace(/\/$/, '');
      const key = apiKeyInput.value.trim();

      const response = await fetch(endpoint + '/', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        testResult.textContent = `Connected to vault: ${data.name || data.vault || 'Unknown'}`;
        testResult.className = 'status success';
      } else if (response.status === 401) {
        testResult.textContent = 'Invalid API key';
        testResult.className = 'status error';
      } else {
        testResult.textContent = `Connection failed: ${response.status}`;
        testResult.className = 'status error';
      }
    } catch (err) {
      testResult.textContent = `Cannot connect: ${err.message}. Is Obsidian running with the Local REST API plugin?`;
      testResult.className = 'status error';
    }
  });

  function updateSettingsVisibility() {
    settingsDiv.style.display = enabledCheckbox.checked ? 'block' : 'none';
  }

  function updateRestApiVisibility() {
    restApiSettings.style.display = methodSelect.value === 'obsidian-rest-api' ? 'block' : 'none';
  }
}

/**
 * Get Obsidian config from storage
 */
async function getObsidianConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get('obsidian', (result) => {
      resolve({ ...DEFAULT_OBSIDIAN_CONFIG, ...result.obsidian });
    });
  });
}

/**
 * Save Obsidian config to storage
 */
async function saveObsidianConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ obsidian: config }, resolve);
  });
}

/**
 * Initialize Maintenance UI
 */
function initMaintenanceUI() {
  const scanBtn = document.getElementById('scan-attachments');
  const statusEl = document.getElementById('scan-attachments-status');

  scanBtn.addEventListener('click', async () => {
    scanBtn.disabled = true;
    statusEl.textContent = 'Scanning threads...';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'BACKFILL_ATTACHMENT_TYPES',
      });

      if (response.success) {
        const { updated, skipped, total } = response;
        statusEl.textContent = `Done! Updated ${updated} threads, ${skipped} already had types (${total} total)`;
        statusEl.style.color = '#059669';
      } else {
        statusEl.textContent = `Error: ${response.error}`;
        statusEl.style.color = '#dc2626';
      }
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.style.color = '#dc2626';
    } finally {
      scanBtn.disabled = false;
    }
  });
}

// Icon definitions for preview
const LUCIDE_PREVIEW_ICONS = {
  code: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
  doc: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
  image: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
  user: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
  bot: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path></svg>',
};

const EMOJI_PREVIEW_ICONS = {
  code: '{ }',
  doc: '📄',
  image: '🖼',
  user: '👤',
  bot: '🤖',
};

/**
 * Initialize Appearance Settings
 */
function initAppearanceSettings() {
  const select = document.getElementById('icon-style');
  const previewEl = document.getElementById('preview-icons');
  const uiModeSelect = document.getElementById('ui-mode');

  // Load saved values
  chrome.storage.local.get(['iconStyle', 'uiMode'], (result) => {
    select.value = result.iconStyle || 'lucide';
    updateIconPreview(select.value);

    if (uiModeSelect) {
      uiModeSelect.value = result.uiMode || 'full';
    }
  });

  // Handle icon style change
  select.addEventListener('change', () => {
    const style = select.value;
    chrome.storage.local.set({ iconStyle: style });
    updateIconPreview(style);
    setStatus('Icon style updated. Refresh the thread view to see changes.', 'success');
  });

  // Handle UI mode change
  if (uiModeSelect) {
    uiModeSelect.addEventListener('change', () => {
      const mode = uiModeSelect.value;
      chrome.storage.local.set({ uiMode: mode });
      setStatus(`UI mode set to ${mode}. Changes take effect on next popup/search open.`, 'success');
    });
  }

  function updateIconPreview(style) {
    const icons = style === 'lucide' ? LUCIDE_PREVIEW_ICONS : EMOJI_PREVIEW_ICONS;
    previewEl.innerHTML = Object.entries(icons)
      .map(([name, icon]) => `<span style="display: inline-flex; align-items: center; gap: 4px; margin-right: 12px; font-size: 14px;"><span style="color: #374151;">${icon}</span><span style="color: #9ca3af; font-size: 11px;">${name}</span></span>`)
      .join('');
  }
}

/**
 * Seed demo data into the demo database
 */
async function seedDemoDatabase(demoData) {
  const DB_NAME = 'ai-thread-hub-demo';
  const DB_VERSION = 5;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('threads')) {
        const store = db.createObjectStore('threads', { keyPath: 'id' });
        store.createIndex('provider', 'provider', { unique: false });
        store.createIndex('provider_thread_id', 'provider_thread_id', { unique: false });
        store.createIndex('last_synced_at', 'last_synced_at', { unique: false });
      }
      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', { keyPath: 'id' });
        store.createIndex('thread_id', 'thread_id', { unique: false });
      }
    };

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['threads', 'messages'], 'readwrite');
      const threadStore = tx.objectStore('threads');
      const messageStore = tx.objectStore('messages');

      let threadsInserted = 0;
      let messagesInserted = 0;

      for (const thread of demoData.threads) {
        const messages = thread.messages || [];
        const threadRecord = { ...thread };
        delete threadRecord.messages;

        threadStore.put(threadRecord);
        threadsInserted++;

        for (const msg of messages) {
          messageStore.put({ ...msg, thread_id: thread.id });
          messagesInserted++;
        }
      }

      tx.oncomplete = () => {
        db.close();
        resolve({ threadsInserted, messagesInserted });
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

/**
 * Clear all demo database data
 */
async function clearDemoDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('ai-thread-hub-demo');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    request.onblocked = () => {
      console.warn('Demo database deletion blocked - close other tabs');
      resolve();
    };
  });
}

/**
 * Inline demo data generator
 */
function generateDemoDataInline() {
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randomDate(daysBack = 90) {
    const now = new Date();
    const past = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const randomTime = past.getTime() + Math.random() * (now.getTime() - past.getTime());
    return new Date(randomTime).toISOString();
  }

  const PROVIDERS = ['chatgpt', 'claude', 'gemini', 'grok', 'copilot'];
  const CATEGORIES = {
    work: ['Debug API issue', 'Review PR #234', 'Optimize queries', 'Write unit tests', 'Refactor module'],
    personal: ['Plan weekend trip', 'Gift ideas', 'Recipe suggestions', 'Book recommendations'],
    learning: ['Explain React hooks', 'Learn Kubernetes', 'ML concepts', 'SQL optimization'],
    finance: ['Tax strategies', 'Investment review', 'Budget planning'],
    health: ['Nutrition plan', 'Meditation tips', 'Sleep optimization'],
  };

  const USER_MESSAGES = [
    "Can you help me with this?",
    "I'm getting an error when I try to run this code.",
    "What's the best approach for handling this?",
    "Could you explain how this works?",
  ];

  const ASSISTANT_MESSAGES = [
    "I'd be happy to help! Here are a few approaches...",
    "Great question! Let me explain the key concepts.",
    "Looking at your error, it seems related to authentication.",
    "Here's a solution that should work well for your use case.",
  ];

  function generateMessages(count) {
    const messages = [];
    let lastRole = 'assistant';
    for (let i = 0; i < count; i++) {
      const role = lastRole === 'user' ? 'assistant' : 'user';
      messages.push({
        id: `msg-${generateUUID()}`,
        role,
        text: role === 'user' ? randomChoice(USER_MESSAGES) : randomChoice(ASSISTANT_MESSAGES),
        created_at: new Date().toISOString(),
        index: i,
      });
      lastRole = role;
    }
    return messages;
  }

  const threads = [];
  const categoryKeys = Object.keys(CATEGORIES);

  for (let i = 0; i < 75; i++) {
    const category = randomChoice(categoryKeys);
    const provider = randomChoice(PROVIDERS);
    const threadId = generateUUID();
    const messageCount = randomInt(2, 20);
    const messages = generateMessages(messageCount);

    threads.push({
      id: `thread-${threadId}`,
      provider,
      provider_thread_id: threadId,
      title: randomChoice(CATEGORIES[category]),
      url: `https://${provider}.com/c/${threadId}`,
      created_at: randomDate(90),
      last_synced_at: new Date().toISOString(),
      message_count: messageCount,
      searchable_content: messages.map(m => m.text).join('\n').toLowerCase(),
      ai_summary: `Discussion about ${category} topics.`,
      status: randomChoice(['new', 'in_progress', 'complete']),
      category,
      tags: [category, randomChoice(['quick', 'detailed', 'ongoing'])],
      priority: randomChoice(['low', 'medium', 'high']),
      messages,
    });
  }

  return { threads };
}

async function save() {
  const apiKeyInput = document.getElementById('api-key').value.trim();
  const columnsInput = document.getElementById('custom-columns').value.trim();

  try {
    await saveApiKey(apiKeyInput);

    let parsed = [];
    if (columnsInput) {
      parsed = JSON.parse(columnsInput);
      if (!Array.isArray(parsed)) {
        throw new Error('Custom columns must be an array');
      }
    }
    await saveCustomColumns(parsed);

    // Save Obsidian config
    const obsidianConfig = {
      enabled: document.getElementById('obsidian-enabled').checked,
      method: document.getElementById('obsidian-method').value,
      apiEndpoint: document.getElementById('obsidian-endpoint').value.trim().replace(/\/$/, ''),
      apiKey: document.getElementById('obsidian-api-key').value.trim(),
      syncIntervalMinutes: parseInt(document.getElementById('obsidian-interval').value, 10) || 30,
      targetFolder: document.getElementById('obsidian-folder').value.trim() || 'AI Threads',
      folderStructure: document.getElementById('obsidian-structure').value,
      includeMessages: document.getElementById('obsidian-messages').value,
    };
    await saveObsidianConfig(obsidianConfig);

    // Notify background script to update alarm if enabled
    if (obsidianConfig.enabled && obsidianConfig.method === 'obsidian-rest-api') {
      chrome.runtime.sendMessage({
        type: 'OBSIDIAN_CONFIG_CHANGED',
        config: obsidianConfig,
      }).catch(() => {});
    }

    setStatus('Settings saved successfully!', 'success');
  } catch (err) {
    console.error('Save failed:', err);
    setStatus(`Failed to save: ${err.message}`, 'error');
  }
}

function setStatus(text, type = 'success') {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = `status ${type}`;

  if (type === 'success') {
    setTimeout(() => {
      el.textContent = '';
      el.className = 'status';
    }, 3000);
  }
}

init();
document.getElementById('save').addEventListener('click', save);
