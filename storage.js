const DB_NAME_PRODUCTION = 'ai-thread-hub';
const DB_NAME_DEMO = 'ai-thread-hub-demo';
const DB_VERSION = 7; // Bumped for embeddings store

// Current database name (can be switched via settings)
let currentDbName = DB_NAME_PRODUCTION;

/**
 * Initialize the database module by loading the selected database from settings
 * Call this once at startup before any database operations
 */
async function initDatabase() {
  try {
    const result = await chrome.storage.local.get('selectedDatabase');
    if (result.selectedDatabase === 'demo') {
      currentDbName = DB_NAME_DEMO;
    } else {
      currentDbName = DB_NAME_PRODUCTION;
    }
    console.log('[Storage] Using database:', currentDbName);
  } catch (e) {
    console.warn('[Storage] Failed to load database setting, using production:', e);
    currentDbName = DB_NAME_PRODUCTION;
  }
  return currentDbName;
}

/**
 * Get the currently selected database name
 */
function getSelectedDatabase() {
  return currentDbName === DB_NAME_DEMO ? 'demo' : 'production';
}

/**
 * Set the database to use (requires page reload to take effect on existing connections)
 * @param {'production' | 'demo'} dbChoice
 */
async function setSelectedDatabase(dbChoice) {
  await chrome.storage.local.set({ selectedDatabase: dbChoice });
  currentDbName = dbChoice === 'demo' ? DB_NAME_DEMO : DB_NAME_PRODUCTION;
  console.log('[Storage] Database set to:', currentDbName);
}
const THREAD_STORE = 'threads';
const MESSAGE_STORE = 'messages';
const ARTIFACT_STORE = 'artifacts';
const CASE_STORE = 'cases';
const CASE_LINK_STORE = 'caseThreadLinks';
const THREAD_LINK_STORE = 'threadLinks';
const PROJECT_STORE = 'projects';
const PROJECT_THREAD_STORE = 'projectThreads';
const CUSTOM_COLUMNS_STORE = 'customColumns';
const SYNC_QUEUE_STORE = 'syncQueue';
const OBSIDIAN_SYNC_STORE = 'obsidianSync';
const EMBEDDING_STORE = 'embeddings';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(currentDbName, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(THREAD_STORE)) {
        const threadStore = db.createObjectStore(THREAD_STORE, { keyPath: 'id' });
        threadStore.createIndex('provider', 'provider', { unique: false });
        threadStore.createIndex('provider_thread_id', 'provider_thread_id', { unique: false });
        threadStore.createIndex('last_synced_at', 'last_synced_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(MESSAGE_STORE)) {
        const messageStore = db.createObjectStore(MESSAGE_STORE, { keyPath: 'id' });
        messageStore.createIndex('thread_id', 'thread_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(ARTIFACT_STORE)) {
        const artifactStore = db.createObjectStore(ARTIFACT_STORE, { keyPath: 'id' });
        artifactStore.createIndex('thread_id', 'thread_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(CASE_STORE)) {
        db.createObjectStore(CASE_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CASE_LINK_STORE)) {
        const linkStore = db.createObjectStore(CASE_LINK_STORE, { keyPath: 'id' });
        linkStore.createIndex('case_id', 'case_id', { unique: false });
        linkStore.createIndex('thread_id', 'thread_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(CUSTOM_COLUMNS_STORE)) {
        db.createObjectStore(CUSTOM_COLUMNS_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const queueStore = db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: 'id' });
        queueStore.createIndex('status', 'status', { unique: false });
        queueStore.createIndex('provider', 'provider', { unique: false });
      }
      if (!db.objectStoreNames.contains(THREAD_LINK_STORE)) {
        const linkStore = db.createObjectStore(THREAD_LINK_STORE, { keyPath: 'id' });
        linkStore.createIndex('source_thread_id', 'source_thread_id', { unique: false });
        linkStore.createIndex('target_thread_id', 'target_thread_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        const projectStore = db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
        projectStore.createIndex('provider', 'provider', { unique: false });
        projectStore.createIndex('provider_project_id', 'provider_project_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(PROJECT_THREAD_STORE)) {
        const ptStore = db.createObjectStore(PROJECT_THREAD_STORE, { keyPath: 'id' });
        ptStore.createIndex('project_id', 'project_id', { unique: false });
        ptStore.createIndex('thread_id', 'thread_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(OBSIDIAN_SYNC_STORE)) {
        const obsidianStore = db.createObjectStore(OBSIDIAN_SYNC_STORE, { keyPath: 'thread_id' });
        obsidianStore.createIndex('sync_status', 'sync_status', { unique: false });
        obsidianStore.createIndex('synced_at', 'synced_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(EMBEDDING_STORE)) {
        const embeddingStore = db.createObjectStore(EMBEDDING_STORE, { keyPath: 'thread_id' });
        embeddingStore.createIndex('model', 'model', { unique: false });
        embeddingStore.createIndex('computed_at', 'computed_at', { unique: false });
      }
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore(storeName, mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    const store = tx.objectStore(storeName);
    let result;
    const actionResult = action(store, tx);
    if (actionResult !== undefined) {
      result = actionResult;
    }
  });
}

function generateId(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
}

// ============================================================
// Thread operations
// ============================================================

async function upsertThread(thread) {
  const record = { ...thread };
  if (!record.id) record.id = generateId('thread');
  record.last_synced_at = new Date().toISOString();
  await withStore(THREAD_STORE, 'readwrite', (store) => store.put(record));
  return record;
}

async function getThreadById(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(THREAD_STORE, 'readonly');
    const store = tx.objectStore(THREAD_STORE);
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

async function getThreadByProviderId(provider, providerThreadId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(THREAD_STORE, 'readonly');
    const store = tx.objectStore(THREAD_STORE);
    const index = store.index('provider_thread_id');
    const request = index.openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.provider === provider && cursor.value.provider_thread_id === providerThreadId) {
          resolve(cursor.value);
          return;
        }
        cursor.continue();
      } else {
        resolve(null);
      }
    };
  });
}

async function listThreads(filters = {}) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(THREAD_STORE, 'readonly');
    const store = tx.objectStore(THREAD_STORE);
    const results = [];
    const request = store.openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const value = cursor.value;
        // Filter out hidden threads by default (unless includeHidden is true)
        const includeHidden = filters.includeHidden === true;
        if (
          (includeHidden || !value.is_hidden) &&
          (!filters.provider || value.provider === filters.provider) &&
          (!filters.status || value.status === filters.status) &&
          (!filters.source || value.source === filters.source) &&
          (!filters.cli_tool || value.cli_tool === filters.cli_tool) &&
          (filters.contains_pii === undefined || value.contains_pii === filters.contains_pii) &&
          (filters.contains_security_or_secrets === undefined || value.contains_security_or_secrets === filters.contains_security_or_secrets)
        ) {
          results.push(value);
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };
  });
}

async function updateThreadField(threadId, updates) {
  const existing = await getThreadById(threadId);
  if (!existing) throw new Error(`Thread ${threadId} not found`);
  const updated = { ...existing, ...updates };
  // If user made manual edit, mark as not AI-only
  if (updates.user_resolution_note !== undefined || updates.status !== undefined) {
    updated.is_ai_inferred_only = false;
  }
  await withStore(THREAD_STORE, 'readwrite', (store) => store.put(updated));
  return updated;
}

// ============================================================
// Message operations
// ============================================================

/**
 * Replace all messages for a thread (delete existing, insert new)
 * This ensures no duplicates accumulate on re-sync
 */
async function upsertMessages(messages, threadId) {
  if (!Array.isArray(messages) || !messages.length) return [];

  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(MESSAGE_STORE, 'readwrite');
    const store = tx.objectStore(MESSAGE_STORE);
    const index = store.index('thread_id');

    // First, delete all existing messages for this thread
    const deleteRequest = index.openCursor(IDBKeyRange.only(threadId));
    deleteRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      }
      // After deletion completes, cursor will be null and we insert new messages
    };

    // Prepare new messages
    const toInsert = messages.map((m, idx) => ({
      id: generateId('msg'),
      thread_id: threadId,
      role: m.role || 'assistant',
      text: m.text || '',
      created_at: m.created_at,
      index: m.index ?? idx,
    }));

    tx.oncomplete = () => resolve(toInsert);
    tx.onerror = () => reject(tx.error);

    // Insert new messages (will happen after deletes due to transaction ordering)
    // Use a small delay to ensure deletes process first
    deleteRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      } else {
        // All deletes done, now insert
        toInsert.forEach((m) => store.put(m));
      }
    };
  });
}

async function getMessagesByThreadId(threadId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MESSAGE_STORE, 'readonly');
    const store = tx.objectStore(MESSAGE_STORE);
    const index = store.index('thread_id');
    const request = index.getAll(threadId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const results = request.result || [];
      // Sort by index, then deduplicate (keeps first occurrence of each index)
      results.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const deduplicated = deduplicateMessagesByIndex(results);
      resolve(deduplicated);
    };
  });
}

/**
 * Deduplicate messages by index (primary) or content hash (fallback).
 * This ensures all consumers get clean data without implementing their own dedup.
 * @param {Array} messages - Sorted array of messages
 * @returns {Array} Deduplicated messages
 */
function deduplicateMessagesByIndex(messages) {
  if (!messages || messages.length === 0) return [];

  const seen = new Map();
  return messages.filter(msg => {
    // Use index as primary key, fall back to role+content hash for messages without index
    const key = msg.index !== undefined
      ? `idx:${msg.index}`
      : `${msg.role}:${(msg.text || '').slice(0, 100)}`;
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
}

// ============================================================
// Artifact operations
// ============================================================

async function upsertArtifacts(artifacts, threadId) {
  if (!Array.isArray(artifacts) || !artifacts.length) return [];
  const toInsert = artifacts.map((a) => ({
    id: a.id || generateId('artifact'),
    thread_id: threadId,
    type: a.type || 'other',
    label: a.label || 'Untitled',
    url: a.url || '',
    content: a.content || '',
  }));
  await withStore(ARTIFACT_STORE, 'readwrite', (store) => {
    toInsert.forEach((a) => store.put(a));
  });
  return toInsert;
}

async function getArtifactsByThreadId(threadId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ARTIFACT_STORE, 'readonly');
    const store = tx.objectStore(ARTIFACT_STORE);
    const index = store.index('thread_id');
    const request = index.getAll(threadId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

// ============================================================
// Case operations (meta-threads)
// ============================================================

async function createCase(caseData) {
  const record = {
    id: caseData.id || generateId('case'),
    title: caseData.title || 'Untitled Case',
    description: caseData.description || '',
    status: caseData.status || 'open',
    created_at: new Date().toISOString(),
    last_updated_at: new Date().toISOString(),
  };
  await withStore(CASE_STORE, 'readwrite', (store) => store.put(record));
  return record;
}

async function listCases() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CASE_STORE, 'readonly');
    const store = tx.objectStore(CASE_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

async function linkThreadToCase(caseId, threadId, relationType = 'related') {
  const record = {
    id: generateId('link'),
    case_id: caseId,
    thread_id: threadId,
    relation_type: relationType,
  };
  await withStore(CASE_LINK_STORE, 'readwrite', (store) => store.put(record));
  return record;
}

async function getThreadsForCase(caseId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CASE_LINK_STORE, 'readonly');
    const store = tx.objectStore(CASE_LINK_STORE);
    const index = store.index('case_id');
    const request = index.getAll(caseId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

// ============================================================
// Custom columns config
// ============================================================

async function saveCustomColumns(configs) {
  const clean = configs.map((c) => ({ ...c, enabled: Boolean(c.enabled) }));
  await withStore(CUSTOM_COLUMNS_STORE, 'readwrite', (store) => {
    clean.forEach((c) => store.put(c));
  });
  return clean;
}

async function getCustomColumns() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CUSTOM_COLUMNS_STORE, 'readonly');
    const store = tx.objectStore(CUSTOM_COLUMNS_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

// ============================================================
// Settings (API key, etc.)
// ============================================================

async function saveApiKey(key) {
  await chrome.storage.local.set({ openaiApiKey: key });
  return key;
}

async function getApiKey() {
  const stored = await chrome.storage.local.get('openaiApiKey');
  return stored.openaiApiKey || '';
}

// ============================================================
// Sync Queue operations
// ============================================================

/**
 * Queue item structure:
 * {
 *   id: string,           // unique key: `${provider}:${providerThreadId}`
 *   provider: string,
 *   provider_thread_id: string,
 *   url: string,
 *   title: string,
 *   status: 'pending' | 'syncing' | 'completed' | 'failed',
 *   added_at: ISO string,
 *   last_attempt_at: ISO string | null,
 *   attempt_count: number,
 *   error: string | null
 * }
 */

async function addToSyncQueue(items) {
  if (!Array.isArray(items) || !items.length) return [];
  const now = new Date().toISOString();
  const toInsert = items.map((item, index) => ({
    id: `${item.provider}:${item.provider_thread_id}`,
    provider: item.provider,
    provider_thread_id: item.provider_thread_id,
    url: item.url,
    title: item.title || 'Untitled',
    status: 'pending',
    added_at: now,
    priority: item.priority ?? 0, // Higher priority = processed first
    sequence: index, // Preserve insertion order within batch
    last_attempt_at: null,
    attempt_count: 0,
    error: null,
  }));

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(SYNC_QUEUE_STORE);

    // Add new items, or update priority/sequence on existing pending items
    const added = [];
    let pending = toInsert.length;

    toInsert.forEach((item) => {
      const getReq = store.get(item.id);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) {
          // New item - add it
          store.put(item);
          added.push(item);
        } else if (existing.status === 'pending') {
          // Update priority/sequence on existing pending items
          existing.priority = item.priority;
          existing.sequence = item.sequence;
          existing.added_at = item.added_at; // Refresh timestamp too
          store.put(existing);
        }
        // Don't touch completed/in-progress/failed items
        pending--;
        if (pending === 0) resolve(added);
      };
      getReq.onerror = () => {
        pending--;
        if (pending === 0) resolve(added);
      };
    });
  });
}

async function getNextFromQueue() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, 'readonly');
    const store = tx.objectStore(SYNC_QUEUE_STORE);
    const index = store.index('status');
    const request = index.getAll(IDBKeyRange.only('pending'));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const items = request.result || [];
      if (items.length === 0) {
        resolve(null);
        return;
      }
      // Sort by: priority DESC, then added_at DESC, then sequence ASC
      items.sort((a, b) => {
        // Priority first (higher = first)
        const priorityA = a.priority ?? 0;
        const priorityB = b.priority ?? 0;
        if (priorityA !== priorityB) return priorityB - priorityA;

        // Then by added_at (newer first)
        const dateA = a.added_at ? new Date(a.added_at) : new Date(0);
        const dateB = b.added_at ? new Date(b.added_at) : new Date(0);
        if (dateA.getTime() !== dateB.getTime()) return dateB - dateA;

        // Then by sequence (lower = first, preserves insertion order)
        return (a.sequence ?? 999) - (b.sequence ?? 999);
      });
      resolve(items[0]);
    };
  });
}

async function updateQueueItemStatus(id, status, error = null) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(SYNC_QUEUE_STORE);
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const item = request.result;
      if (!item) {
        resolve(null);
        return;
      }
      item.status = status;
      item.last_attempt_at = new Date().toISOString();
      item.attempt_count = (item.attempt_count || 0) + 1;
      if (error) item.error = error;
      store.put(item);
      resolve(item);
    };
  });
}

async function getSyncQueueStats() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, 'readonly');
    const store = tx.objectStore(SYNC_QUEUE_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const items = request.result || [];
      const stats = {
        total: items.length,
        pending: 0,
        syncing: 0,
        completed: 0,
        failed: 0,
      };
      items.forEach((item) => {
        if (stats[item.status] !== undefined) {
          stats[item.status]++;
        }
      });
      resolve(stats);
    };
  });
}

async function clearSyncQueue(statusFilter = null) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(SYNC_QUEUE_STORE);

    if (!statusFilter) {
      // Clear all
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(true);
    } else {
      // Clear only matching status
      const index = store.index('status');
      const request = index.openCursor(IDBKeyRange.only(statusFilter));
      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        } else {
          resolve(true);
        }
      };
    }
  });
}

async function resetFailedInQueue() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(SYNC_QUEUE_STORE);
    const index = store.index('status');
    const request = index.openCursor(IDBKeyRange.only('failed'));
    let count = 0;
    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const item = cursor.value;
        item.status = 'pending';
        item.error = null;
        store.put(item);
        count++;
        cursor.continue();
      } else {
        resolve(count);
      }
    };
  });
}

// ============================================================
// Thread Links (relationships between threads)
// ============================================================

/**
 * Link structure:
 * {
 *   id: string,
 *   source_thread_id: string,
 *   target_thread_id: string,
 *   link_type: 'related' | 'continuation' | 'reference' | 'project',
 *   created_at: ISO string,
 *   notes: string (optional)
 * }
 */

async function linkThreads(sourceThreadId, targetThreadId, linkType = 'related', notes = '') {
  // Don't allow self-links
  if (sourceThreadId === targetThreadId) return null;

  // Check if link already exists
  const existing = await getThreadLink(sourceThreadId, targetThreadId);
  if (existing) return existing;

  const record = {
    id: generateId('link'),
    source_thread_id: sourceThreadId,
    target_thread_id: targetThreadId,
    link_type: linkType,
    created_at: new Date().toISOString(),
    notes,
  };

  await withStore(THREAD_LINK_STORE, 'readwrite', (store) => store.put(record));
  return record;
}

async function unlinkThreads(sourceThreadId, targetThreadId) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(THREAD_LINK_STORE, 'readwrite');
    const store = tx.objectStore(THREAD_LINK_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const links = request.result || [];
      let deleted = 0;

      for (const link of links) {
        // Delete link in either direction
        if (
          (link.source_thread_id === sourceThreadId && link.target_thread_id === targetThreadId) ||
          (link.source_thread_id === targetThreadId && link.target_thread_id === sourceThreadId)
        ) {
          store.delete(link.id);
          deleted++;
        }
      }

      tx.oncomplete = () => resolve(deleted);
    };
  });
}

async function getThreadLink(sourceThreadId, targetThreadId) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(THREAD_LINK_STORE, 'readonly');
    const store = tx.objectStore(THREAD_LINK_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const links = request.result || [];
      const found = links.find(
        (link) =>
          (link.source_thread_id === sourceThreadId && link.target_thread_id === targetThreadId) ||
          (link.source_thread_id === targetThreadId && link.target_thread_id === sourceThreadId)
      );
      resolve(found || null);
    };
  });
}

async function getLinkedThreads(threadId) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(THREAD_LINK_STORE, 'readonly');
    const store = tx.objectStore(THREAD_LINK_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const links = request.result || [];
      const linkedIds = new Set();
      const linkedInfo = [];

      for (const link of links) {
        if (link.source_thread_id === threadId) {
          if (!linkedIds.has(link.target_thread_id)) {
            linkedIds.add(link.target_thread_id);
            linkedInfo.push({
              thread_id: link.target_thread_id,
              link_type: link.link_type,
              direction: 'outgoing',
              created_at: link.created_at,
              notes: link.notes,
            });
          }
        } else if (link.target_thread_id === threadId) {
          if (!linkedIds.has(link.source_thread_id)) {
            linkedIds.add(link.source_thread_id);
            linkedInfo.push({
              thread_id: link.source_thread_id,
              link_type: link.link_type,
              direction: 'incoming',
              created_at: link.created_at,
              notes: link.notes,
            });
          }
        }
      }

      resolve(linkedInfo);
    };
  });
}

async function getAllThreadLinks() {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(THREAD_LINK_STORE, 'readonly');
    const store = tx.objectStore(THREAD_LINK_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

// ============================================================
// Data quality / cleanup utilities
// ============================================================

/**
 * Find and remove duplicate threads (same provider + provider_thread_id)
 * Keeps the most recently synced version
 * @returns {Promise<Object>} Stats about duplicates found and removed
 */
async function deduplicateThreads() {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(THREAD_STORE, 'readwrite');
    const store = tx.objectStore(THREAD_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const threads = request.result || [];
      const seen = new Map(); // key -> best thread
      const toDelete = [];

      // Group by provider:provider_thread_id
      for (const thread of threads) {
        const key = `${thread.provider}:${thread.provider_thread_id}`;
        const existing = seen.get(key);

        if (existing) {
          // Keep the one with more messages or more recent sync
          const existingMsgCount = existing.messages?.length || 0;
          const threadMsgCount = thread.messages?.length || 0;
          const existingSync = new Date(existing.last_synced_at || 0);
          const threadSync = new Date(thread.last_synced_at || 0);

          if (threadMsgCount > existingMsgCount || (threadMsgCount === existingMsgCount && threadSync > existingSync)) {
            // Current thread is better, delete existing
            toDelete.push(existing.id);
            seen.set(key, thread);
          } else {
            // Existing is better, delete current
            toDelete.push(thread.id);
          }
        } else {
          seen.set(key, thread);
        }
      }

      // Delete duplicates
      for (const id of toDelete) {
        store.delete(id);
      }

      tx.oncomplete = () => {
        resolve({
          totalThreads: threads.length,
          uniqueThreads: seen.size,
          duplicatesRemoved: toDelete.length,
        });
      };
    };
  });
}

/**
 * Get thread statistics for debugging
 * @returns {Promise<Object>} Stats about thread data quality
 */
async function getThreadStats() {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([THREAD_STORE, MESSAGE_STORE], 'readonly');
    const threadStore = tx.objectStore(THREAD_STORE);
    const messageStore = tx.objectStore(MESSAGE_STORE);

    const threadRequest = threadStore.getAll();
    const messageRequest = messageStore.getAll();

    let threads = [];
    let messages = [];

    threadRequest.onsuccess = () => { threads = threadRequest.result || []; };
    messageRequest.onsuccess = () => { messages = messageRequest.result || []; };

    tx.oncomplete = () => {
      // Count messages per thread
      const msgCountByThread = {};
      for (const msg of messages) {
        msgCountByThread[msg.thread_id] = (msgCountByThread[msg.thread_id] || 0) + 1;
      }

      // Analyze threads
      const byProvider = {};
      let zeroMsgCount = 0;
      const zeroMsgThreads = [];

      for (const thread of threads) {
        byProvider[thread.provider] = (byProvider[thread.provider] || 0) + 1;
        const actualMsgCount = msgCountByThread[thread.id] || 0;
        if (actualMsgCount === 0) {
          zeroMsgCount++;
          zeroMsgThreads.push({
            id: thread.id,
            title: thread.title?.slice(0, 50),
            provider: thread.provider,
            last_synced_at: thread.last_synced_at,
          });
        }
      }

      // Find duplicates
      const seen = new Map();
      let duplicateCount = 0;
      for (const thread of threads) {
        const key = `${thread.provider}:${thread.provider_thread_id}`;
        if (seen.has(key)) {
          duplicateCount++;
        } else {
          seen.set(key, thread);
        }
      }

      resolve({
        totalThreads: threads.length,
        totalMessages: messages.length,
        byProvider,
        zeroMsgCount,
        zeroMsgThreads: zeroMsgThreads.slice(0, 20), // First 20
        duplicateCount,
      });
    };

    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Normalize text for comparison - removes trailing punctuation, bullets, whitespace
 */
function normalizeMessageText(text) {
  if (!text) return '';
  return text
    .trim()
    .replace(/[\s•\-\*]+$/, '') // Remove trailing bullets/dashes/whitespace
    .replace(/\s+/g, ' ')       // Normalize whitespace
    .slice(0, 150);             // First 150 chars for comparison
}

/**
 * Check if two messages are near-duplicates
 * (one is a prefix/substring of the other, or very similar)
 */
function areMessagesSimilar(text1, text2) {
  const norm1 = normalizeMessageText(text1);
  const norm2 = normalizeMessageText(text2);

  if (!norm1 || !norm2) return false;

  // Exact match after normalization
  if (norm1 === norm2) return true;

  // One is a prefix of the other (streaming partial content)
  if (norm1.startsWith(norm2) || norm2.startsWith(norm1)) return true;

  // Very similar (>90% of shorter string matches)
  const shorter = norm1.length < norm2.length ? norm1 : norm2;
  const longer = norm1.length < norm2.length ? norm2 : norm1;
  if (longer.includes(shorter) && shorter.length / longer.length > 0.8) return true;

  return false;
}

/**
 * Deduplicate messages within each thread
 * Keeps unique messages, removes near-duplicates (streaming artifacts)
 * Prefers longer versions when duplicates found
 * @returns {Promise<Object>} Stats about duplicates removed
 */
async function deduplicateMessages() {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(MESSAGE_STORE, 'readwrite');
    const store = tx.objectStore(MESSAGE_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const messages = request.result || [];

      // Group by thread_id
      const byThread = new Map();
      for (const msg of messages) {
        if (!byThread.has(msg.thread_id)) {
          byThread.set(msg.thread_id, []);
        }
        byThread.get(msg.thread_id).push(msg);
      }

      const toDelete = [];

      // For each thread, dedupe messages
      for (const [threadId, threadMsgs] of byThread) {
        // Sort by index to maintain order
        threadMsgs.sort((a, b) => (a.index || 0) - (b.index || 0));

        // Keep track of unique messages (prefer longer versions)
        const kept = [];

        for (const msg of threadMsgs) {
          // Check if this message is similar to any we're keeping
          let isDuplicate = false;
          let replaceIndex = -1;

          for (let i = 0; i < kept.length; i++) {
            const keptMsg = kept[i];
            // Only compare messages with same role
            if (keptMsg.role !== msg.role) continue;

            if (areMessagesSimilar(keptMsg.text, msg.text)) {
              isDuplicate = true;
              // If current message is longer, replace the kept one
              if ((msg.text || '').length > (keptMsg.text || '').length) {
                replaceIndex = i;
              }
              break;
            }
          }

          if (isDuplicate) {
            if (replaceIndex >= 0) {
              // Current is longer, delete the kept one and keep current
              toDelete.push(kept[replaceIndex].id);
              kept[replaceIndex] = msg;
            } else {
              // Kept one is longer or same, delete current
              toDelete.push(msg.id);
            }
          } else {
            kept.push(msg);
          }
        }
      }

      // Delete duplicates
      for (const id of toDelete) {
        store.delete(id);
      }

      tx.oncomplete = () => {
        resolve({
          totalMessages: messages.length,
          duplicatesRemoved: toDelete.length,
          threadsProcessed: byThread.size,
        });
      };
    };
  });
}

/**
 * Delete threads with zero messages
 * @returns {Promise<number>} Number of threads deleted
 */
async function deleteEmptyThreads() {
  const stats = await getThreadStats();
  const db = await openDb();

  if (stats.zeroMsgThreads.length === 0) {
    return 0;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(THREAD_STORE, 'readwrite');
    const store = tx.objectStore(THREAD_STORE);

    let deleted = 0;
    for (const thread of stats.zeroMsgThreads) {
      store.delete(thread.id);
      deleted++;
    }

    tx.oncomplete = () => resolve(deleted);
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================
// Search utilities
// ============================================================

/**
 * Build searchable content string from messages
 * @param {Array} messages - Array of message objects with role and text
 * @returns {string} Lowercase concatenated text for searching
 */
function buildSearchableContent(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '';

  return messages
    .map((m) => m.text || '')
    .join(' ')
    .toLowerCase()
    .slice(0, 50000); // Cap at 50KB to avoid storage bloat
}

/**
 * Search threads by content
 * @param {string} query - Search query (case insensitive)
 * @param {Object} filters - Optional filters (provider, status, etc.)
 * @returns {Promise<Array>} Matching threads with match info
 */
async function searchThreads(query, filters = {}) {
  const allThreads = await listThreads(filters);
  const searchTerm = query.toLowerCase().trim();

  if (!searchTerm) return allThreads.map((t) => ({ ...t, matchSnippet: null }));

  const results = [];
  for (const thread of allThreads) {
    // Search in title
    const titleLower = (thread.title || '').toLowerCase();
    const titleMatch = titleLower.includes(searchTerm);

    // Search in summary
    const summaryLower = (thread.ai_summary || thread.provider_summary || '').toLowerCase();
    const summaryMatch = summaryLower.includes(searchTerm);

    // Search in tags
    const tags = Array.isArray(thread.tags) ? thread.tags : [];
    const tagMatch = tags.some((tag) => tag.toLowerCase().includes(searchTerm));

    // Search in category
    const categoryLower = (thread.category || '').toLowerCase();
    const categoryMatch = categoryLower.includes(searchTerm);

    // Search in searchable_content (full message text)
    const contentLower = (thread.searchable_content || '').toLowerCase();
    const contentMatch = contentLower.includes(searchTerm);

    if (titleMatch || summaryMatch || tagMatch || categoryMatch || contentMatch) {
      let matchSnippet = null;

      // Extract snippet if match was in content
      if (contentMatch && contentLower) {
        const matchIndex = contentLower.indexOf(searchTerm);
        const start = Math.max(0, matchIndex - 50);
        const end = Math.min(contentLower.length, matchIndex + searchTerm.length + 50);
        const snippet = thread.searchable_content.slice(start, end);
        matchSnippet = (start > 0 ? '...' : '') + snippet + (end < contentLower.length ? '...' : '');
      }

      // Determine match location (priority order)
      let matchLocation = 'content';
      if (titleMatch) matchLocation = 'title';
      else if (summaryMatch) matchLocation = 'summary';
      else if (tagMatch) matchLocation = 'tag';
      else if (categoryMatch) matchLocation = 'category';

      results.push({
        ...thread,
        matchSnippet,
        matchLocation,
      });
    }
  }

  return results;
}

// ============================================================
// Project operations (provider projects like ChatGPT Projects, Claude Projects)
// ============================================================

/**
 * Project structure:
 * {
 *   id: string,                   // internal ID
 *   provider: string,             // 'chatgpt', 'claude', 'gemini', 'grok'
 *   provider_project_id: string,  // ID from the provider
 *   name: string,                 // Project name
 *   description: string,          // Optional description
 *   href: string,                 // URL to the project page
 *   discovered_at: ISO string,    // When we first saw this project
 *   last_synced_at: ISO string,   // Last time we synced
 *   thread_count: number,         // Cached thread count
 *   metadata: object,             // Provider-specific metadata
 * }
 */

async function upsertProject(project) {
  const record = { ...project };
  if (!record.id) record.id = generateId('project');
  record.last_synced_at = new Date().toISOString();
  if (!record.discovered_at) record.discovered_at = record.last_synced_at;
  await withStore(PROJECT_STORE, 'readwrite', (store) => store.put(record));
  return record;
}

async function getProjectById(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, 'readonly');
    const store = tx.objectStore(PROJECT_STORE);
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

async function getProjectByProviderId(provider, providerProjectId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, 'readonly');
    const store = tx.objectStore(PROJECT_STORE);
    const index = store.index('provider_project_id');
    const request = index.openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.provider === provider && cursor.value.provider_project_id === providerProjectId) {
          resolve(cursor.value);
          return;
        }
        cursor.continue();
      } else {
        resolve(null);
      }
    };
  });
}

async function listProjects(filters = {}) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, 'readonly');
    const store = tx.objectStore(PROJECT_STORE);
    const results = [];
    const request = store.openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const value = cursor.value;
        if (!filters.provider || value.provider === filters.provider) {
          results.push(value);
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };
  });
}

async function deleteProject(projectId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PROJECT_STORE, PROJECT_THREAD_STORE], 'readwrite');
    const projectStore = tx.objectStore(PROJECT_STORE);
    const linkStore = tx.objectStore(PROJECT_THREAD_STORE);

    // Delete the project
    projectStore.delete(projectId);

    // Delete all thread links for this project
    const index = linkStore.index('project_id');
    const request = index.openCursor(IDBKeyRange.only(projectId));
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        linkStore.delete(cursor.primaryKey);
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================
// Project-Thread link operations
// ============================================================

/**
 * ProjectThread link structure:
 * {
 *   id: string,            // unique ID
 *   project_id: string,    // Internal project ID
 *   thread_id: string,     // Internal thread ID
 *   added_at: ISO string,  // When thread was linked to project
 * }
 */

async function addThreadToProject(projectId, threadId) {
  // Check if link already exists
  const existing = await getProjectThreadLink(projectId, threadId);
  if (existing) return existing;

  const record = {
    id: `${projectId}:${threadId}`,
    project_id: projectId,
    thread_id: threadId,
    added_at: new Date().toISOString(),
  };

  await withStore(PROJECT_THREAD_STORE, 'readwrite', (store) => store.put(record));

  // Update cached thread count
  const threads = await getProjectThreads(projectId);
  const project = await getProjectById(projectId);
  if (project) {
    project.thread_count = threads.length;
    await upsertProject(project);
  }

  return record;
}

async function removeThreadFromProject(projectId, threadId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_THREAD_STORE, 'readwrite');
    const store = tx.objectStore(PROJECT_THREAD_STORE);
    const id = `${projectId}:${threadId}`;
    store.delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function getProjectThreadLink(projectId, threadId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_THREAD_STORE, 'readonly');
    const store = tx.objectStore(PROJECT_THREAD_STORE);
    const id = `${projectId}:${threadId}`;
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

async function getProjectThreads(projectId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_THREAD_STORE, 'readonly');
    const store = tx.objectStore(PROJECT_THREAD_STORE);
    const index = store.index('project_id');
    const request = index.getAll(projectId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

async function getThreadProjects(threadId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_THREAD_STORE, 'readonly');
    const store = tx.objectStore(PROJECT_THREAD_STORE);
    const index = store.index('thread_id');
    const request = index.getAll(threadId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

// ============================================================
// Obsidian Sync State operations
// ============================================================

/**
 * Obsidian sync state structure:
 * {
 *   thread_id: string,       // Primary key - the thread ID
 *   obsidian_path: string,   // Path in Obsidian vault
 *   content_hash: string,    // Hash of content when last synced
 *   synced_at: ISO string,   // When last synced
 *   sync_status: 'synced' | 'pending' | 'error',
 *   error: string | null,    // Error message if sync failed
 * }
 */

async function getObsidianSyncState(threadId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OBSIDIAN_SYNC_STORE, 'readonly');
    const store = tx.objectStore(OBSIDIAN_SYNC_STORE);
    const request = store.get(threadId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

async function getAllObsidianSyncStates() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OBSIDIAN_SYNC_STORE, 'readonly');
    const store = tx.objectStore(OBSIDIAN_SYNC_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const results = request.result || [];
      // Convert to map by thread_id for easy lookup
      const statesMap = {};
      for (const state of results) {
        statesMap[state.thread_id] = state;
      }
      resolve(statesMap);
    };
  });
}

async function updateObsidianSyncState(threadId, stateUpdate) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OBSIDIAN_SYNC_STORE, 'readwrite');
    const store = tx.objectStore(OBSIDIAN_SYNC_STORE);

    // Get existing state first
    const getRequest = store.get(threadId);
    getRequest.onsuccess = () => {
      const existing = getRequest.result || { thread_id: threadId };
      const updated = { ...existing, ...stateUpdate, thread_id: threadId };
      store.put(updated);
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteObsidianSyncState(threadId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OBSIDIAN_SYNC_STORE, 'readwrite');
    const store = tx.objectStore(OBSIDIAN_SYNC_STORE);
    store.delete(threadId);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function clearObsidianSyncStates() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OBSIDIAN_SYNC_STORE, 'readwrite');
    const store = tx.objectStore(OBSIDIAN_SYNC_STORE);
    const request = store.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(true);
  });
}

// ============================================================
// Embedding operations
// ============================================================

/**
 * Embedding record structure:
 * {
 *   thread_id: string,       // Primary key - the thread ID
 *   embedding: number[],     // 1536-dimensional vector for text-embedding-3-small
 *   model: string,           // Model used (e.g., 'text-embedding-3-small')
 *   computed_at: ISO string, // When the embedding was computed
 *   input_hash: string,      // Hash of input text (to detect changes)
 * }
 */

async function getEmbedding(threadId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EMBEDDING_STORE, 'readonly');
    const store = tx.objectStore(EMBEDDING_STORE);
    const request = store.get(threadId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

async function getAllEmbeddings() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EMBEDDING_STORE, 'readonly');
    const store = tx.objectStore(EMBEDDING_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

async function saveEmbedding(threadId, embedding, model, inputHash) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EMBEDDING_STORE, 'readwrite');
    const store = tx.objectStore(EMBEDDING_STORE);
    const record = {
      thread_id: threadId,
      embedding,
      model,
      input_hash: inputHash,
      computed_at: new Date().toISOString(),
    };
    store.put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteEmbedding(threadId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EMBEDDING_STORE, 'readwrite');
    const store = tx.objectStore(EMBEDDING_STORE);
    store.delete(threadId);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function clearEmbeddings() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EMBEDDING_STORE, 'readwrite');
    const store = tx.objectStore(EMBEDDING_STORE);
    const request = store.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(true);
  });
}

async function getEmbeddingsCount() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EMBEDDING_STORE, 'readonly');
    const store = tx.objectStore(EMBEDDING_STORE);
    const request = store.count();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// ============================================================
// Validation operations
// ============================================================

/**
 * Validation status values:
 * - 'unvalidated': Never validated
 * - 'valid': Passed validation (counts match)
 * - 'suspicious': Retry needed or minor discrepancy
 * - 'mismatch': Count decreased or content changed unexpectedly
 *
 * Validation flags:
 * - 'count_decreased': New scrape has fewer messages
 * - 'count_increased': New scrape has significantly more messages (>20%)
 * - 'content_changed': First message text differs
 * - 'scrape_failed': Scrape returned 0 messages
 */

async function updateThreadValidation(threadId, validationData) {
  const existing = await getThreadById(threadId);
  if (!existing) throw new Error(`Thread ${threadId} not found`);

  const updated = {
    ...existing,
    validation_status: validationData.status || existing.validation_status || 'unvalidated',
    validation_flags: validationData.flags || existing.validation_flags || [],
    validated_at: validationData.validated_at || new Date().toISOString(),
    validation_message_count: validationData.message_count ?? existing.validation_message_count,
    validation_first_message: validationData.first_message ?? existing.validation_first_message,
  };

  await withStore(THREAD_STORE, 'readwrite', (store) => store.put(updated));
  return updated;
}

async function getThreadsForValidation(options = {}) {
  const { provider, status, limit, includeValid = false } = options;
  const threads = await listThreads({ provider });

  let filtered = threads;

  // Filter by validation status
  if (!includeValid) {
    filtered = filtered.filter((t) =>
      !t.validation_status ||
      t.validation_status === 'unvalidated' ||
      t.validation_status === 'suspicious'
    );
  }

  if (status) {
    filtered = filtered.filter((t) => t.validation_status === status);
  }

  // Sort by last_synced_at (oldest first - validate old data first)
  filtered.sort((a, b) => {
    const dateA = a.last_synced_at ? new Date(a.last_synced_at) : new Date(0);
    const dateB = b.last_synced_at ? new Date(b.last_synced_at) : new Date(0);
    return dateA - dateB;
  });

  if (limit && limit > 0) {
    filtered = filtered.slice(0, limit);
  }

  return filtered;
}

async function getValidationStats() {
  const threads = await listThreads({});

  const stats = {
    total: threads.length,
    unvalidated: 0,
    valid: 0,
    suspicious: 0,
    mismatch: 0,
    byProvider: {},
    flagCounts: {},
  };

  for (const thread of threads) {
    const status = thread.validation_status || 'unvalidated';

    // Count by status
    if (status === 'unvalidated') stats.unvalidated++;
    else if (status === 'valid') stats.valid++;
    else if (status === 'suspicious') stats.suspicious++;
    else if (status === 'mismatch') stats.mismatch++;

    // Count by provider
    const provider = thread.provider || 'unknown';
    if (!stats.byProvider[provider]) {
      stats.byProvider[provider] = { total: 0, valid: 0, suspicious: 0, mismatch: 0 };
    }
    stats.byProvider[provider].total++;
    if (status === 'valid') stats.byProvider[provider].valid++;
    if (status === 'suspicious') stats.byProvider[provider].suspicious++;
    if (status === 'mismatch') stats.byProvider[provider].mismatch++;

    // Count flags
    const flags = thread.validation_flags || [];
    for (const flag of flags) {
      stats.flagCounts[flag] = (stats.flagCounts[flag] || 0) + 1;
    }
  }

  return stats;
}

async function getThreadsWithValidationIssues(options = {}) {
  const { provider, limit } = options;
  const threads = await listThreads({ provider });

  // Filter to only threads with issues
  let filtered = threads.filter((t) =>
    t.validation_status === 'suspicious' ||
    t.validation_status === 'mismatch' ||
    (t.validation_flags && t.validation_flags.length > 0)
  );

  // Sort by severity (mismatch > suspicious) then by validated_at
  filtered.sort((a, b) => {
    const severityOrder = { mismatch: 0, suspicious: 1, valid: 2, unvalidated: 3 };
    const sevA = severityOrder[a.validation_status] ?? 3;
    const sevB = severityOrder[b.validation_status] ?? 3;
    if (sevA !== sevB) return sevA - sevB;

    const dateA = a.validated_at ? new Date(a.validated_at) : new Date(0);
    const dateB = b.validated_at ? new Date(b.validated_at) : new Date(0);
    return dateB - dateA;
  });

  if (limit && limit > 0) {
    filtered = filtered.slice(0, limit);
  }

  return filtered;
}

async function clearValidationStatus() {
  const threads = await listThreads({});
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(THREAD_STORE, 'readwrite');
    const store = tx.objectStore(THREAD_STORE);

    let updated = 0;
    for (const thread of threads) {
      if (thread.validation_status) {
        const cleared = {
          ...thread,
          validation_status: 'unvalidated',
          validation_flags: [],
          validated_at: null,
          validation_message_count: null,
          validation_first_message: null,
        };
        store.put(cleared);
        updated++;
      }
    }

    tx.oncomplete = () => resolve(updated);
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================
// Hidden threads and duplicate detection
// ============================================================

/**
 * Hide a thread (soft delete)
 * @param {string} threadId - Thread to hide
 * @param {string} [reason] - Reason for hiding (e.g., 'duplicate', 'manual')
 * @param {string} [duplicateOf] - If duplicate, ID of the original thread
 */
async function hideThread(threadId, reason = 'manual', duplicateOf = null) {
  const existing = await getThreadById(threadId);
  if (!existing) throw new Error(`Thread ${threadId} not found`);

  const updated = {
    ...existing,
    is_hidden: true,
    hidden_at: new Date().toISOString(),
    hidden_reason: reason,
    duplicate_of: duplicateOf,
  };

  await withStore(THREAD_STORE, 'readwrite', (store) => store.put(updated));
  return updated;
}

/**
 * Unhide a thread
 */
async function unhideThread(threadId) {
  const existing = await getThreadById(threadId);
  if (!existing) throw new Error(`Thread ${threadId} not found`);

  const updated = {
    ...existing,
    is_hidden: false,
    hidden_at: null,
    hidden_reason: null,
    duplicate_of: null,
  };

  await withStore(THREAD_STORE, 'readwrite', (store) => store.put(updated));
  return updated;
}

/**
 * Get all hidden threads
 */
async function getHiddenThreads(options = {}) {
  const { provider, reason } = options;
  const threads = await listThreads({ provider, includeHidden: true });

  let filtered = threads.filter((t) => t.is_hidden === true);

  if (reason) {
    filtered = filtered.filter((t) => t.hidden_reason === reason);
  }

  // Sort by hidden_at descending
  filtered.sort((a, b) => {
    const dateA = a.hidden_at ? new Date(a.hidden_at) : new Date(0);
    const dateB = b.hidden_at ? new Date(b.hidden_at) : new Date(0);
    return dateB - dateA;
  });

  return filtered;
}

/**
 * Find duplicate threads based on message content
 * Returns groups of threads that appear to be duplicates
 *
 * Duplicate criteria (must match ALL):
 * - Same provider
 * - Same message count
 * - Same title (normalized)
 * - First 3 messages have identical content
 */
async function findDuplicateThreads(options = {}) {
  const { provider } = options;
  const threads = await listThreads({ provider, includeHidden: false });

  // Build content hash map
  const hashGroups = new Map(); // hash -> array of threads

  for (const thread of threads) {
    // Normalize title for comparison (lowercase, trim, remove extra spaces)
    const normalizedTitle = (thread.title || '').toLowerCase().trim().replace(/\s+/g, ' ');

    let signature;
    let messageCount = 0;
    let firstMessage = '';

    // For threads with messages, use content-based signature
    if (thread.message_count && thread.message_count > 0) {
      const messages = await getMessagesByThreadId(thread.id);
      if (messages && messages.length > 0) {
        messageCount = messages.length;
        firstMessage = (messages[0]?.content || '').substring(0, 100);

        // Create a strict content signature:
        // - Provider + message count + title + first 3 messages
        const messageContent = messages
          .slice(0, 3)
          .map(m => (m.content || '').substring(0, 1000))
          .join('|||');

        signature = `${thread.provider}:${messages.length}:${normalizedTitle}:${messageContent}`;
      }
    }

    // For empty threads, use provider + title only
    // This catches threads synced multiple times with no content
    // (same title from same provider = likely duplicate)
    if (!signature) {
      signature = `empty:${thread.provider}:${normalizedTitle}`;
    }

    // Hash the signature
    const hash = await computeContentHash({ signature });

    if (!hashGroups.has(hash)) {
      hashGroups.set(hash, []);
    }
    hashGroups.get(hash).push({
      ...thread,
      _messageCount: messageCount,
      _firstMessage: firstMessage,
    });
  }

  // Filter to only groups with duplicates
  const duplicateGroups = [];
  for (const [hash, group] of hashGroups) {
    if (group.length > 1) {
      // Sort by last_synced_at descending (newest first = original)
      group.sort((a, b) => {
        const dateA = a.last_synced_at ? new Date(a.last_synced_at) : new Date(0);
        const dateB = b.last_synced_at ? new Date(b.last_synced_at) : new Date(0);
        return dateB - dateA;
      });

      duplicateGroups.push({
        hash,
        original: group[0],
        duplicates: group.slice(1),
        count: group.length,
      });
    }
  }

  // Sort by duplicate count descending
  duplicateGroups.sort((a, b) => b.count - a.count);

  return duplicateGroups;
}

/**
 * Auto-hide duplicate threads, keeping the newest one
 * Returns count of threads hidden
 */
async function autoHideDuplicates(options = {}) {
  const duplicateGroups = await findDuplicateThreads(options);

  let hiddenCount = 0;
  for (const group of duplicateGroups) {
    for (const dupe of group.duplicates) {
      await hideThread(dupe.id, 'duplicate', group.original.id);
      hiddenCount++;
    }
  }

  return { hiddenCount, groupCount: duplicateGroups.length };
}

// ============================================================
// Utilities
// ============================================================

async function computeContentHash(threadPayload) {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(threadPayload));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export {
  // Threads
  upsertThread,
  getThreadById,
  getThreadByProviderId,
  listThreads,
  updateThreadField,
  // Messages
  upsertMessages,
  getMessagesByThreadId,
  // Artifacts
  upsertArtifacts,
  getArtifactsByThreadId,
  // Cases
  createCase,
  listCases,
  linkThreadToCase,
  getThreadsForCase,
  // Custom columns
  saveCustomColumns,
  getCustomColumns,
  // Sync queue
  addToSyncQueue,
  getNextFromQueue,
  updateQueueItemStatus,
  getSyncQueueStats,
  clearSyncQueue,
  resetFailedInQueue,
  // Settings
  saveApiKey,
  getApiKey,
  // Search
  buildSearchableContent,
  searchThreads,
  // Data quality
  deduplicateThreads,
  deduplicateMessages,
  getThreadStats,
  deleteEmptyThreads,
  // Thread links
  linkThreads,
  unlinkThreads,
  getLinkedThreads,
  getAllThreadLinks,
  // Projects
  upsertProject,
  getProjectById,
  getProjectByProviderId,
  listProjects,
  deleteProject,
  addThreadToProject,
  removeThreadFromProject,
  getProjectThreads,
  getThreadProjects,
  // Utils
  computeContentHash,
  // Database selection
  initDatabase,
  getSelectedDatabase,
  setSelectedDatabase,
  // Obsidian sync
  getObsidianSyncState,
  getAllObsidianSyncStates,
  updateObsidianSyncState,
  deleteObsidianSyncState,
  clearObsidianSyncStates,
  // Embeddings
  getEmbedding,
  getAllEmbeddings,
  saveEmbedding,
  deleteEmbedding,
  clearEmbeddings,
  getEmbeddingsCount,
  // Validation
  updateThreadValidation,
  getThreadsForValidation,
  getValidationStats,
  getThreadsWithValidationIssues,
  clearValidationStatus,
  // Hidden threads and duplicates
  hideThread,
  unhideThread,
  getHiddenThreads,
  findDuplicateThreads,
  autoHideDuplicates,
};
