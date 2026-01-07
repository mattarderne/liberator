/**
 * Demo Mode Module for AI Thread Hub
 * Manages switching between production and demo databases
 */

const DEMO_MODE_KEY = 'demoMode';
const DEMO_DB_NAME = 'ai-thread-hub-demo';
const PRODUCTION_DB_NAME = 'ai-thread-hub';

/**
 * Check if demo mode is currently enabled
 * @returns {Promise<boolean>}
 */
async function isDemoMode() {
  const result = await chrome.storage.local.get(DEMO_MODE_KEY);
  return result[DEMO_MODE_KEY] === true;
}

/**
 * Enable or disable demo mode
 * @param {boolean} enabled - Whether to enable demo mode
 * @returns {Promise<void>}
 */
async function setDemoMode(enabled) {
  await chrome.storage.local.set({ [DEMO_MODE_KEY]: enabled });
  // Notify all tabs and background script of the change
  chrome.runtime.sendMessage({ type: 'DEMO_MODE_CHANGED', enabled });
}

/**
 * Get the current database name based on demo mode
 * @returns {Promise<string>}
 */
async function getCurrentDbName() {
  const isDemo = await isDemoMode();
  return isDemo ? DEMO_DB_NAME : PRODUCTION_DB_NAME;
}

/**
 * Clear all demo data
 * @returns {Promise<void>}
 */
async function clearDemoData() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DEMO_DB_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    request.onblocked = () => {
      console.warn('Demo database deletion blocked - close other tabs');
      resolve();
    };
  });
}

/**
 * Seed demo database with generated data
 * @param {Object} demoData - Generated demo data from generate-demo-data.js
 * @returns {Promise<Object>} Stats about seeded data
 */
async function seedDemoData(demoData) {
  if (!demoData || !demoData.threads) {
    throw new Error('Invalid demo data format');
  }

  const DB_VERSION = 5;
  const THREAD_STORE = 'threads';
  const MESSAGE_STORE = 'messages';
  const THREAD_LINK_STORE = 'threadLinks';
  const PROJECT_STORE = 'projects';
  const PROJECT_THREAD_STORE = 'projectThreads';
  const CASE_STORE = 'cases';
  const CASE_LINK_STORE = 'caseThreadLinks';
  const ARTIFACT_STORE = 'artifacts';
  const CUSTOM_COLUMNS_STORE = 'customColumns';
  const SYNC_QUEUE_STORE = 'syncQueue';

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DEMO_DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create all required stores
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
    };

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction([THREAD_STORE, MESSAGE_STORE, THREAD_LINK_STORE], 'readwrite');
      const threadStore = tx.objectStore(THREAD_STORE);
      const messageStore = tx.objectStore(MESSAGE_STORE);
      const linkStore = tx.objectStore(THREAD_LINK_STORE);

      let threadsInserted = 0;
      let messagesInserted = 0;
      let linksInserted = 0;

      // Insert threads and their messages
      for (const thread of demoData.threads) {
        // Extract messages from thread
        const messages = thread.messages || [];
        const threadRecord = { ...thread };
        delete threadRecord.messages; // Don't store messages inline

        threadStore.put(threadRecord);
        threadsInserted++;

        // Insert messages separately
        for (const msg of messages) {
          messageStore.put({
            ...msg,
            thread_id: thread.id,
          });
          messagesInserted++;
        }
      }

      // Insert thread links - use explicit links from demo data if provided
      if (demoData.links && demoData.links.length > 0) {
        // Use explicitly defined links from demo data
        for (const link of demoData.links) {
          const linkRecord = {
            id: link.id || `link-${Date.now()}-${linksInserted}`,
            source_thread_id: link.source_thread_id,
            target_thread_id: link.target_thread_id,
            link_type: link.type || link.link_type || 'reference',
            created_at: link.created_at || new Date().toISOString(),
            notes: link.notes || '',
          };
          linkStore.put(linkRecord);
          linksInserted++;
        }
      } else {
        // Fallback: Create some random thread links for demo
        const threadIds = demoData.threads.map((t) => t.id);
        const linkTypes = ['related', 'continuation', 'reference'];
        const numLinks = Math.floor(demoData.threads.length * 0.1); // ~10% threads linked

        for (let i = 0; i < numLinks; i++) {
          const sourceIdx = Math.floor(Math.random() * threadIds.length);
          let targetIdx = Math.floor(Math.random() * threadIds.length);
          while (targetIdx === sourceIdx) {
            targetIdx = Math.floor(Math.random() * threadIds.length);
          }

          const linkRecord = {
            id: `link-${Date.now()}-${i}`,
            source_thread_id: threadIds[sourceIdx],
            target_thread_id: threadIds[targetIdx],
            link_type: linkTypes[Math.floor(Math.random() * linkTypes.length)],
            created_at: new Date().toISOString(),
            notes: '',
          };

          linkStore.put(linkRecord);
          linksInserted++;
        }
      }

      tx.oncomplete = () => {
        db.close();
        resolve({
          threadsInserted,
          messagesInserted,
          linksInserted,
        });
      };

      tx.onerror = () => reject(tx.error);
    };
  });
}

/**
 * Export demo data for saving/sharing
 * @returns {Promise<Object>} All demo database contents
 */
async function exportDemoData() {
  const isDemo = await isDemoMode();
  if (!isDemo) {
    throw new Error('Export only available in demo mode');
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DEMO_DB_NAME);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains('threads')) {
        db.close();
        resolve({ threads: [], messages: [], links: [] });
        return;
      }

      const tx = db.transaction(['threads', 'messages', 'threadLinks'], 'readonly');
      const threads = [];
      const messages = [];
      const links = [];

      tx.objectStore('threads').getAll().onsuccess = (e) => {
        threads.push(...(e.target.result || []));
      };
      tx.objectStore('messages').getAll().onsuccess = (e) => {
        messages.push(...(e.target.result || []));
      };
      tx.objectStore('threadLinks').getAll().onsuccess = (e) => {
        links.push(...(e.target.result || []));
      };

      tx.oncomplete = () => {
        db.close();
        resolve({
          version: '1.0',
          exported_at: new Date().toISOString(),
          threads,
          messages,
          links,
        });
      };

      tx.onerror = () => reject(tx.error);
    };
  });
}

/**
 * List all threads from demo database
 * @returns {Promise<Array>} Array of threads
 */
async function listDemoThreads() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DEMO_DB_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('threads')) {
        db.close();
        resolve([]);
        return;
      }
      const tx = db.transaction('threads', 'readonly');
      const store = tx.objectStore('threads');
      const getAll = store.getAll();
      getAll.onsuccess = () => {
        db.close();
        resolve(getAll.result || []);
      };
      getAll.onerror = () => {
        db.close();
        reject(getAll.error);
      };
    };
  });
}

/**
 * Get messages for a thread from demo database
 * @param {string} threadId
 * @returns {Promise<Array>}
 */
async function getDemoMessages(threadId) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DEMO_DB_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('messages')) {
        db.close();
        resolve([]);
        return;
      }
      const tx = db.transaction('messages', 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('thread_id');
      const getAll = index.getAll(threadId);
      getAll.onsuccess = () => {
        db.close();
        const msgs = getAll.result || [];
        msgs.sort((a, b) => (a.index || 0) - (b.index || 0));
        resolve(msgs);
      };
      getAll.onerror = () => {
        db.close();
        reject(getAll.error);
      };
    };
  });
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.DemoMode = {
    isDemoMode,
    setDemoMode,
    getCurrentDbName,
    clearDemoData,
    seedDemoData,
    exportDemoData,
    listDemoThreads,
    getDemoMessages,
    DEMO_DB_NAME,
    PRODUCTION_DB_NAME,
  };
}

// ES module exports (for use in options.js)
if (typeof module === 'undefined') {
  // Browser script context - exports already handled via window.DemoMode
} else {
  // Node.js context
  module.exports = { isDemoMode, setDemoMode, getCurrentDbName, clearDemoData, seedDemoData, exportDemoData, listDemoThreads, getDemoMessages, DEMO_DB_NAME, PRODUCTION_DB_NAME };
}
