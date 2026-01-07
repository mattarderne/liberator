import { classifyThread } from './openai.js';
import { detectPII, summarizePII } from './pii-detector.js';
import { detectAttachmentTypes } from './attachment-detector.js';
import { findSimilarThreads, tfidfSearch, batchComputeTFIDF } from './similarity.js';
import {
  upsertThread,
  upsertMessages,
  upsertArtifacts,
  listThreads,
  getThreadByProviderId,
  getThreadById,
  getMessagesByThreadId,
  getArtifactsByThreadId,
  getCustomColumns,
  updateThreadField,
  computeContentHash,
  buildSearchableContent,
  searchThreads,
  deduplicateThreads,
  deduplicateMessages,
  getThreadStats,
  deleteEmptyThreads,
  addToSyncQueue,
  getNextFromQueue,
  updateQueueItemStatus,
  getSyncQueueStats,
  clearSyncQueue,
  resetFailedInQueue,
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
  // Database selection
  initDatabase,
  getSelectedDatabase,
  // Obsidian sync
  getObsidianSyncState,
  getAllObsidianSyncStates,
  updateObsidianSyncState,
  // Embeddings
  getEmbedding,
  getAllEmbeddings,
  saveEmbedding,
  getEmbeddingsCount,
  clearEmbeddings,
  // API Key
  getApiKey,
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
} from './storage.js';
import {
  generateEmbedding,
  prepareThreadText,
  computeTextHash,
  cosineSimilarity,
  projectTo2D,
  buildSimilarityEdges,
  EMBEDDING_MODEL,
} from './embeddings.js';
import { detectProvider, getProviderUrlForChat } from './providers/index.js';
import {
  parseClaudeCodeSession,
  getImportStats,
  parseSessionsFromData,
} from './cli-import.js';

// ========== LOG BROADCASTING ==========
const logHistory = [];
const MAX_LOG_HISTORY = 50;

function broadcastLog(tag, message, logType = 'info') {
  const entry = { tag, message, type: logType, time: Date.now() };
  logHistory.push(entry);
  if (logHistory.length > MAX_LOG_HISTORY) {
    logHistory.shift();
  }

  // Console log for service worker debugging
  const prefix = `[${tag.toUpperCase()}]`;
  if (logType === 'error') {
    console.error(prefix, message);
  } else {
    console.log(prefix, message);
  }

  // Broadcast to any open popups
  chrome.runtime.sendMessage({
    type: 'LOG_BROADCAST',
    tag,
    message,
    logType,
  }).catch(() => {
    // Popup might not be open, ignore error
  });
}

// Track discovered chats from sidebars (provider -> chatId -> position/metadata)
// This is now backed by chrome.storage.local to survive service worker restarts
let discoveredChats = new Map();
let discoveredChatsLoaded = false;

// Load discovered chats from storage on startup
async function loadDiscoveredChats() {
  if (discoveredChatsLoaded) return;
  try {
    const stored = await chrome.storage.local.get('discoveredChats');
    broadcastLog('info', `Loading discoveredChats from storage...`);
    if (stored.discoveredChats) {
      // Convert stored object back to Map of Maps
      let totalChats = 0;
      for (const [providerId, chats] of Object.entries(stored.discoveredChats)) {
        discoveredChats.set(providerId, new Map(Object.entries(chats)));
        totalChats += Object.keys(chats).length;
      }
      broadcastLog('info', `Loaded ${totalChats} chats from ${discoveredChats.size} providers`);
    } else {
      broadcastLog('info', 'No discoveredChats found in storage');
    }
    discoveredChatsLoaded = true;
  } catch (err) {
    broadcastLog('error', `Failed to load discoveredChats: ${err.message}`, 'error');
  }
}

// Save discovered chats to storage
async function saveDiscoveredChats() {
  try {
    // Convert Map of Maps to plain object for storage
    const toStore = {};
    for (const [providerId, chats] of discoveredChats) {
      toStore[providerId] = Object.fromEntries(chats);
    }
    await chrome.storage.local.set({ discoveredChats: toStore });
    console.log('[Discovery] Saved to storage');
  } catch (err) {
    console.warn('[Discovery] Failed to save to storage:', err);
  }
}

// Initialize database on startup
initDatabase().then(async (db) => {
  console.log('[Background] Database initialized:', db);
  // Log embedding count for debugging
  try {
    const embeddingCount = await getEmbeddingsCount();
    console.log('[Background] Embeddings in storage:', embeddingCount);
  } catch (e) {
    console.log('[Background] Could not get embedding count:', e.message);
  }
}).catch(err => {
  console.error('[Background] Failed to initialize database:', err);
});

// Background sync state
let syncLoopRunning = false;
let syncLoopTabId = null;
let syncLoopPaused = false;
const DEFAULT_SYNC_DELAY_MS = 45000; // 45 seconds between syncs

// Validation audit state
let validationAuditRunning = false;
let validationAuditTabId = null;
let validationAuditProgress = { current: 0, total: 0, valid: 0, suspicious: 0, mismatch: 0 };
const DEFAULT_VALIDATION_DELAY_MS = 60000; // 60 seconds between validations (slower for overnight)

// ========== ERROR CLASSIFICATION ==========
const ERROR_TYPES = {
  TIMEOUT: { retry: true, backoffMultiplier: 1.5, description: 'Request timed out' },
  RATE_LIMITED: { retry: true, backoffMultiplier: 3, description: 'Rate limited by provider' },
  NOT_FOUND: { retry: false, backoffMultiplier: 1, description: 'Page not found' },
  AUTH_REQUIRED: { retry: false, stopQueue: true, backoffMultiplier: 1, description: 'Authentication required' },
  NETWORK: { retry: true, backoffMultiplier: 2, description: 'Network error' },
  CONTENT_SCRIPT: { retry: true, backoffMultiplier: 1.5, description: 'Content script error' },
  TAB_CLOSED: { retry: true, backoffMultiplier: 1, description: 'Tab was closed' },
  UNKNOWN: { retry: true, backoffMultiplier: 2, description: 'Unknown error' },
};

function classifyError(error) {
  const msg = (error?.message || error || '').toString().toLowerCase();

  if (msg.includes('429') || msg.includes('rate') || msg.includes('too many')) {
    return 'RATE_LIMITED';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'TIMEOUT';
  }
  if (msg.includes('404') || msg.includes('not found') || msg.includes('no longer available')) {
    return 'NOT_FOUND';
  }
  if (msg.includes('401') || msg.includes('403') || msg.includes('login') ||
      msg.includes('unauthorized') || msg.includes('sign in') || msg.includes('authentication')) {
    return 'AUTH_REQUIRED';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection') ||
      msg.includes('dns') || msg.includes('offline')) {
    return 'NETWORK';
  }
  if (msg.includes('receiving end') || msg.includes('content script') || msg.includes('inject')) {
    return 'CONTENT_SCRIPT';
  }
  if (msg.includes('tab closed') || msg.includes('tab was closed') || msg.includes('no tab')) {
    return 'TAB_CLOSED';
  }
  return 'UNKNOWN';
}

// ========== ADAPTIVE DELAY WITH JITTER ==========
const DELAY_CONFIG = {
  MIN_MS: 15000,      // 15s minimum
  BASE_MS: 45000,     // 45s base
  MAX_MS: 300000,     // 5 min cap
  JITTER_FACTOR: 0.25, // ±25% jitter
  SUCCESS_SPEEDUP_THRESHOLD: 3, // Speed up after N consecutive successes
};

function calculateAdaptiveDelay(consecutiveFailures, consecutiveSuccesses, lastErrorType = null) {
  let delay;

  if (consecutiveFailures > 0) {
    // Exponential backoff on failures
    const errorConfig = ERROR_TYPES[lastErrorType] || ERROR_TYPES.UNKNOWN;
    const backoffMultiplier = Math.pow(errorConfig.backoffMultiplier, consecutiveFailures);
    delay = DELAY_CONFIG.BASE_MS * backoffMultiplier;
  } else if (consecutiveSuccesses >= DELAY_CONFIG.SUCCESS_SPEEDUP_THRESHOLD) {
    // Speed up if things are going well
    delay = DELAY_CONFIG.MIN_MS;
  } else {
    delay = DELAY_CONFIG.BASE_MS;
  }

  // Add jitter: ±25% to avoid predictable patterns
  const jitter = delay * DELAY_CONFIG.JITTER_FACTOR * (Math.random() * 2 - 1);
  const finalDelay = Math.round(delay + jitter);

  return Math.min(Math.max(finalDelay, DELAY_CONFIG.MIN_MS), DELAY_CONFIG.MAX_MS);
}

// ========== SYNC HEALTH METRICS ==========
const syncHealth = {
  totalAttempts: 0,
  successCount: 0,
  failCount: 0,
  retryCount: 0,
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
  lastErrorType: null,
  lastErrorMessage: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  avgDurationMs: 0,
  durations: [], // Rolling window of last 20 durations
  errorCounts: {}, // Count by error type
  startedAt: null,
};

function updateHealthMetrics(success, durationMs, errorType = null, errorMessage = null) {
  syncHealth.totalAttempts++;
  syncHealth.durations.push(durationMs);
  if (syncHealth.durations.length > 20) {
    syncHealth.durations.shift();
  }
  syncHealth.avgDurationMs = Math.round(
    syncHealth.durations.reduce((a, b) => a + b, 0) / syncHealth.durations.length
  );

  if (success) {
    syncHealth.successCount++;
    syncHealth.consecutiveSuccesses++;
    syncHealth.consecutiveFailures = 0;
    syncHealth.lastSuccessAt = Date.now();
  } else {
    syncHealth.failCount++;
    syncHealth.consecutiveFailures++;
    syncHealth.consecutiveSuccesses = 0;
    syncHealth.lastFailureAt = Date.now();
    syncHealth.lastErrorType = errorType;
    syncHealth.lastErrorMessage = errorMessage;

    // Track error counts by type
    syncHealth.errorCounts[errorType] = (syncHealth.errorCounts[errorType] || 0) + 1;
  }
}

function getSyncHealth() {
  const successRate = syncHealth.totalAttempts > 0
    ? Math.round((syncHealth.successCount / syncHealth.totalAttempts) * 100)
    : 0;

  return {
    ...syncHealth,
    successRate,
    status: syncHealth.consecutiveFailures >= 3 ? 'unhealthy' :
            syncHealth.consecutiveFailures > 0 ? 'degraded' : 'healthy',
  };
}

function resetSyncHealth() {
  Object.assign(syncHealth, {
    totalAttempts: 0,
    successCount: 0,
    failCount: 0,
    retryCount: 0,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    lastErrorType: null,
    lastErrorMessage: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    avgDurationMs: 0,
    durations: [],
    errorCounts: {},
    startedAt: Date.now(),
  });
}

// ========== STRUCTURED LOGGING ==========
function logScrapeAttempt(context) {
  const {
    item,
    attempt,
    maxAttempts,
    durationMs,
    error,
    success,
    messageCount,
    willRetry,
  } = context;

  const errorType = error ? classifyError(error) : null;
  const status = success ? 'SUCCESS' : (willRetry ? 'RETRY' : 'FAILED');

  const parts = [
    `[${status}]`,
    `"${item.title?.slice(0, 25) || 'untitled'}"`,
    `(${item.provider})`,
    `attempt ${attempt}/${maxAttempts}`,
    `${Math.round(durationMs / 1000)}s`,
  ];

  if (success && messageCount !== undefined) {
    parts.push(`${messageCount} msgs`);
  }

  if (error) {
    parts.push(`[${errorType}]`);
    parts.push(error.message?.slice(0, 50) || String(error).slice(0, 50));
  }

  const logType = success ? 'success' : 'error';
  const tag = success ? 'scrape' : 'error';
  broadcastLog(tag, parts.join(' '), logType);

  return errorType;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (request?.type === 'SYNC_THREADS') {
      const result = await runSync();
      sendResponse(result);
      return;
    }

    if (request?.type === 'AUTO_SYNC_TAB') {
      // Single tab auto-sync (triggered when tab becomes hidden)
      const result = await syncSingleTab(sender.tab);
      sendResponse(result);
      return;
    }

    if (request?.type === 'LIST_THREADS') {
      const threads = await listThreads(request.filters || {});
      sendResponse({ success: true, threads });
      return;
    }

    if (request?.type === 'SEARCH_THREADS') {
      const results = await searchThreads(request.query || '', request.filters || {});
      sendResponse({ success: true, threads: results });
      return;
    }

    if (request?.type === 'OPEN_THREAD_HUB') {
      // Open Thread Hub, optionally with a specific thread
      const baseUrl = chrome.runtime.getURL('ui/view.html');
      let url = baseUrl;
      if (request.threadId) {
        url += `?id=${request.threadId}`;
        if (request.action) {
          url += `&action=${request.action}`;
        }
      }
      chrome.tabs.create({ url });
      sendResponse({ success: true });
      return;
    }

    if (request?.type === 'SYNC_CURRENT_TAB') {
      // Sync the current tab (triggered from command palette)
      if (sender.tab) {
        const result = await syncSingleTab(sender.tab);
        sendResponse(result);
      } else {
        sendResponse({ success: false, error: 'No tab context' });
      }
      return;
    }

    if (request?.type === 'DISCOVER_CHATS') {
      // Get sidebar chat lists from all open AI tabs
      const result = await discoverAllChats();
      sendResponse(result);
      return;
    }

    if (request?.type === 'GET_DISCOVERED') {
      // Return discovered chats with change indicators
      const result = await getDiscoveredWithChanges();
      sendResponse(result);
      return;
    }

    if (request?.type === 'GET_THREAD') {
      // Get full thread details for detail view
      const thread = await getThreadById(request.threadId);
      if (!thread) {
        sendResponse({ success: false, error: 'Thread not found' });
        return;
      }
      const messages = await getMessagesByThreadId(request.threadId);
      const artifacts = await getArtifactsByThreadId(request.threadId);
      sendResponse({ success: true, thread, messages, artifacts });
      return;
    }

    if (request?.type === 'GET_THREAD_MESSAGES') {
      // Get only messages for a thread (used by command palette preview)
      const messages = await getMessagesByThreadId(request.threadId);
      sendResponse({ success: true, messages });
      return;
    }

    if (request?.type === 'UPDATE_THREAD') {
      // Update thread fields (user edits)
      try {
        const updated = await updateThreadField(request.threadId, request.updates);
        sendResponse({ success: true, thread: updated });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    if (request?.type === 'BACKFILL_ATTACHMENT_TYPES') {
      // Scan existing threads and compute attachment_types from stored messages
      try {
        const result = await backfillAttachmentTypes();
        sendResponse({ success: true, ...result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    // ========== QUEUE OPERATIONS ==========

    if (request?.type === 'QUEUE_DISCOVERED') {
      // Add all discovered chats to the sync queue
      const result = await queueDiscoveredChats();
      sendResponse(result);
      return;
    }

    if (request?.type === 'GET_QUEUE_STATS') {
      const stats = await getSyncQueueStats();
      sendResponse({
        success: true,
        stats,
        isRunning: syncLoopRunning,
        isPaused: syncLoopPaused,
      });
      return;
    }

    if (request?.type === 'GET_SYNC_HEALTH') {
      sendResponse({ success: true, health: getSyncHealth() });
      return;
    }

    if (request?.type === 'RESET_SYNC_HEALTH') {
      resetSyncHealth();
      sendResponse({ success: true, message: 'Health metrics reset' });
      return;
    }

    if (request?.type === 'START_QUEUE_SYNC') {
      const delay = request.delayMs || DEFAULT_SYNC_DELAY_MS;
      startSyncLoop(delay);
      sendResponse({ success: true, message: 'Sync loop started' });
      return;
    }

    if (request?.type === 'PAUSE_QUEUE_SYNC') {
      syncLoopPaused = true;
      sendResponse({ success: true, message: 'Sync loop paused' });
      return;
    }

    if (request?.type === 'RESUME_QUEUE_SYNC') {
      syncLoopPaused = false;
      sendResponse({ success: true, message: 'Sync loop resumed' });
      return;
    }

    if (request?.type === 'STOP_QUEUE_SYNC') {
      stopSyncLoop();
      sendResponse({ success: true, message: 'Sync loop stopped' });
      return;
    }

    if (request?.type === 'CLEAR_QUEUE') {
      await clearSyncQueue(request.statusFilter || null);
      sendResponse({ success: true });
      return;
    }

    if (request?.type === 'RETRY_FAILED') {
      const count = await resetFailedInQueue();
      sendResponse({ success: true, resetCount: count });
      return;
    }

    if (request?.type === 'CLEAR_QUEUE') {
      // Clear all items from the sync queue
      try {
        const allItems = await getAllQueueItems();
        let count = 0;
        for (const item of allItems) {
          await deleteQueueItem(item.id);
          count++;
        }
        broadcastLog('info', `Cleared ${count} items from queue`);
        sendResponse({ success: true, count });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    if (request?.type === 'GET_LOG_HISTORY') {
      sendResponse({ success: true, logs: logHistory });
      return;
    }

    if (request?.type === 'EXPORT_LOGS_TO_FILE') {
      // Export all extension logs to a downloadable file
      try {
        const storedLogs = await chrome.storage.local.get('__threadhub_debug_logs__');
        const logs = storedLogs['__threadhub_debug_logs__'] || [];

        // Add broadcast log history
        const allLogs = [...logs, ...logHistory.map(l => ({
          t: l.time,
          s: 'broadcast',
          l: l.type,
          m: `[${l.tag}] ${l.message}`
        }))];

        // Sort by timestamp
        allLogs.sort((a, b) => a.t - b.t);

        // Format logs for readability
        const formatted = allLogs.map(log => {
          const time = new Date(log.t).toISOString();
          const level = (log.l || 'info').toUpperCase().padEnd(5);
          const source = (log.s || 'unknown').padEnd(10);
          return `[${time}] ${level} ${source} ${log.m}`;
        }).join('\n');

        // Create downloadable file
        const blob = new Blob([formatted], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const filename = `threadhub-logs-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.txt`;

        await chrome.downloads.download({
          url,
          filename,
          saveAs: false
        });

        broadcastLog('info', `Exported ${allLogs.length} logs to ${filename}`);
        sendResponse({ success: true, count: allLogs.length, filename });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    if (request?.type === 'CLEAR_ALL_DATA') {
      // Clear discovered chats from memory and storage
      discoveredChats = new Map();
      discoveredChatsLoaded = false;
      await chrome.storage.local.remove('discoveredChats');
      broadcastLog('info', 'Cleared discoveredChats from storage');

      // Clear the sync queue
      await clearSyncQueue();
      broadcastLog('info', 'Cleared sync queue');

      sendResponse({ success: true, message: 'All discovery and queue data cleared' });
      return;
    }

    if (request?.type === 'GET_THREAD_STATS') {
      const stats = await getThreadStats();
      broadcastLog('info', `Stats: ${stats.totalThreads} threads, ${stats.totalMessages} msgs, ${stats.duplicateCount} dupes, ${stats.zeroMsgCount} empty`);
      sendResponse({ success: true, stats });
      return;
    }

    if (request?.type === 'DEDUPLICATE_THREADS') {
      broadcastLog('info', 'Running deduplication...');
      const result = await deduplicateThreads();
      broadcastLog('success', `Deduplication complete: removed ${result.duplicatesRemoved} duplicates`, 'success');
      sendResponse({ success: true, result });
      return;
    }

    if (request?.type === 'DELETE_EMPTY_THREADS') {
      broadcastLog('info', 'Deleting empty threads...');
      const deleted = await deleteEmptyThreads();
      broadcastLog('success', `Deleted ${deleted} empty threads`, 'success');
      sendResponse({ success: true, deleted });
      return;
    }

    if (request?.type === 'CLEANUP_DATA') {
      // Run full cleanup: dedupe threads, dedupe messages, delete empty threads
      broadcastLog('info', 'Running full data cleanup...');

      // 1. Deduplicate threads
      const threadDedupeResult = await deduplicateThreads();
      broadcastLog('info', `Removed ${threadDedupeResult.duplicatesRemoved} duplicate threads`);

      // 2. Deduplicate messages within threads
      const msgDedupeResult = await deduplicateMessages();
      broadcastLog('info', `Removed ${msgDedupeResult.duplicatesRemoved} duplicate messages`);

      // 3. Delete empty threads
      const deletedEmpty = await deleteEmptyThreads();
      broadcastLog('info', `Deleted ${deletedEmpty} empty threads`);

      const stats = await getThreadStats();
      broadcastLog('success', `Cleanup complete! Now: ${stats.totalThreads} threads, ${stats.totalMessages} messages`, 'success');

      sendResponse({
        success: true,
        threadDuplicatesRemoved: threadDedupeResult.duplicatesRemoved,
        messageDuplicatesRemoved: msgDedupeResult.duplicatesRemoved,
        emptyDeleted: deletedEmpty,
        stats,
      });
      return;
    }

    if (request?.type === 'RETAG_THREADS') {
      // Re-run AI classification on existing threads
      const threadIds = request.threadIds; // Optional: specific threads, or all if not provided
      const result = await retagThreads(threadIds);
      sendResponse(result);
      return;
    }

    // ========== THREAD LINKING ==========

    if (request?.type === 'LINK_THREADS') {
      const { sourceThreadId, targetThreadId, linkType, notes } = request;
      const link = await linkThreads(sourceThreadId, targetThreadId, linkType, notes);
      sendResponse({ success: true, link });
      return;
    }

    if (request?.type === 'UNLINK_THREADS') {
      const { sourceThreadId, targetThreadId } = request;
      const deleted = await unlinkThreads(sourceThreadId, targetThreadId);
      sendResponse({ success: true, deleted });
      return;
    }

    if (request?.type === 'GET_LINKED_THREADS') {
      const linkedInfo = await getLinkedThreads(request.threadId);
      // Fetch full thread info for each linked thread
      const linkedThreads = [];
      for (const info of linkedInfo) {
        const thread = await getThreadById(info.thread_id);
        if (thread) {
          linkedThreads.push({
            ...info,
            thread,
          });
        }
      }
      sendResponse({ success: true, linkedThreads });
      return;
    }

    if (request?.type === 'GET_THREAD_SYNC_STATUS') {
      const { provider, providerThreadId } = request;
      const thread = await getThreadByProviderId(provider, providerThreadId);
      if (thread) {
        sendResponse({
          found: true,
          thread: {
            id: thread.id,
            last_synced_at: thread.last_synced_at,
            message_count: thread.message_count,
            title: thread.title,
          }
        });
      } else {
        sendResponse({ found: false });
      }
      return;
    }

    if (request?.type === 'GET_BULK_SYNC_STATUS') {
      const { provider, providerThreadIds } = request;
      const statuses = {};
      for (const providerThreadId of providerThreadIds) {
        const thread = await getThreadByProviderId(provider, providerThreadId);
        if (thread) {
          statuses[providerThreadId] = {
            id: thread.id,
            last_synced_at: thread.last_synced_at,
            message_count: thread.message_count,
          };
        }
      }
      sendResponse({ statuses });
      return;
    }

    if (request?.type === 'GET_ALL_THREAD_LINKS') {
      const links = await getAllThreadLinks();
      sendResponse({ success: true, links });
      return;
    }

    // ========== SIMILARITY OPERATIONS ==========

    if (request?.type === 'GET_SIMILAR_THREADS') {
      const { threadId, topK = 10 } = request;
      console.log('[SimilarThreads BG] Request for:', threadId);
      const thread = await getThreadById(threadId);
      if (!thread) {
        console.log('[SimilarThreads BG] Thread not found');
        sendResponse({ success: false, error: 'Thread not found' });
        return;
      }
      const allThreadsData = await listThreads({});
      console.log('[SimilarThreads BG] Total threads:', allThreadsData.length);

      // Fetch embeddings for hybrid similarity (embeddings + TF-IDF)
      const targetEmbedding = await getEmbedding(threadId);
      const allEmbeddings = await getAllEmbeddings();
      console.log('[SimilarThreads BG] Embeddings - target:', !!targetEmbedding?.embedding, 'all:', allEmbeddings?.length || 0);

      const similar = findSimilarThreads(thread, allThreadsData, topK, {
        targetEmbedding,
        allEmbeddings,
      });
      console.log('[SimilarThreads BG] Found similar:', similar.length);
      sendResponse({ success: true, similar });
      return;
    }

    if (request?.type === 'TFIDF_SEARCH') {
      const { query, topK = 10 } = request;
      const allThreadsData = await listThreads({});
      const results = tfidfSearch(query, allThreadsData, topK);
      sendResponse({ success: true, results });
      return;
    }

    if (request?.type === 'REBUILD_SIMILARITY_INDEX') {
      broadcastLog('similarity', 'Rebuilding TF-IDF vectors for all threads...');
      const allThreadsData = await listThreads({});
      const threadsWithVectors = batchComputeTFIDF(allThreadsData);

      // Update each thread with its TF-IDF vector
      let updated = 0;
      for (const thread of threadsWithVectors) {
        await upsertThread({
          ...thread,
          tfidf_vector: thread.tfidf_vector
        });
        updated++;
      }

      broadcastLog('success', `Rebuilt TF-IDF vectors for ${updated} threads`, 'success');
      sendResponse({ success: true, updated });
      return;
    }

    // ========== PROJECT OPERATIONS ==========

    if (request?.type === 'LIST_PROJECTS') {
      const projects = await listProjects(request.filters || {});
      sendResponse({ success: true, projects });
      return;
    }

    if (request?.type === 'GET_PROJECT') {
      const project = await getProjectById(request.projectId);
      if (!project) {
        sendResponse({ success: false, error: 'Project not found' });
        return;
      }
      // Get threads linked to this project
      const threadLinks = await getProjectThreads(project.id);
      const threads = [];
      for (const link of threadLinks) {
        const thread = await getThreadById(link.thread_id);
        if (thread) {
          threads.push(thread);
        }
      }
      sendResponse({ success: true, project, threads });
      return;
    }

    if (request?.type === 'ADD_THREAD_TO_PROJECT') {
      const { projectId, threadId } = request;
      const link = await addThreadToProject(projectId, threadId);
      sendResponse({ success: true, link });
      return;
    }

    if (request?.type === 'REMOVE_THREAD_FROM_PROJECT') {
      const { projectId, threadId } = request;
      await removeThreadFromProject(projectId, threadId);
      sendResponse({ success: true });
      return;
    }

    if (request?.type === 'GET_THREAD_PROJECTS') {
      const projectLinks = await getThreadProjects(request.threadId);
      const projects = [];
      for (const link of projectLinks) {
        const project = await getProjectById(link.project_id);
        if (project) {
          projects.push(project);
        }
      }
      sendResponse({ success: true, projects });
      return;
    }

    if (request?.type === 'DELETE_PROJECT') {
      await deleteProject(request.projectId);
      sendResponse({ success: true });
      return;
    }

    // ========== OBSIDIAN SYNC OPERATIONS ==========

    if (request?.type === 'GET_OBSIDIAN_SYNC_STATES') {
      const states = await getAllObsidianSyncStates();
      sendResponse({ success: true, states });
      return;
    }

    if (request?.type === 'GET_OBSIDIAN_SYNC_STATE') {
      const { threadId } = request.payload || {};
      const state = await getObsidianSyncState(threadId);
      sendResponse({ success: true, state });
      return;
    }

    if (request?.type === 'UPDATE_OBSIDIAN_SYNC_STATE') {
      const { threadId, state } = request.payload || {};
      await updateObsidianSyncState(threadId, state);
      sendResponse({ success: true });
      return;
    }

    if (request?.type === 'OBSIDIAN_CONFIG_CHANGED') {
      const { config } = request;
      await setupObsidianSyncAlarm(config);
      sendResponse({ success: true });
      return;
    }

    if (request?.type === 'CLAUDE_CODE_CONFIG_CHANGED') {
      const { config } = request;
      await setupClaudeCodeSyncAlarm(config);
      sendResponse({ success: true });
      return;
    }

    if (request?.type === 'RUN_OBSIDIAN_SYNC') {
      const result = await runObsidianSync();
      sendResponse(result);
      return;
    }

    // ========== EMBEDDING OPERATIONS ==========

    if (request?.type === 'GENERATE_EMBEDDINGS') {
      const result = await generateThreadEmbeddings(request.threadIds, request.forceRegenerate);
      sendResponse(result);
      return;
    }

    if (request?.type === 'GET_VISUALIZATION_DATA') {
      const result = await getVisualizationData(request.similarityThreshold);
      sendResponse(result);
      return;
    }

    if (request?.type === 'GET_EMBEDDINGS_COUNT') {
      const count = await getEmbeddingsCount();
      sendResponse({ success: true, count });
      return;
    }

    if (request?.type === 'CLEAR_EMBEDDINGS') {
      await clearEmbeddings();
      sendResponse({ success: true });
      return;
    }

    // ========== VALIDATION OPERATIONS ==========

    if (request?.type === 'GET_VALIDATION_STATS') {
      const stats = await getValidationStats();
      sendResponse({ success: true, stats });
      return;
    }

    if (request?.type === 'GET_THREADS_WITH_ISSUES') {
      const threads = await getThreadsWithValidationIssues(request.options || {});
      sendResponse({ success: true, threads });
      return;
    }

    if (request?.type === 'START_VALIDATION_AUDIT') {
      const result = await startValidationAudit(request.options || {});
      sendResponse(result);
      return;
    }

    if (request?.type === 'STOP_VALIDATION_AUDIT') {
      stopValidationAudit();
      sendResponse({ success: true });
      return;
    }

    if (request?.type === 'GET_VALIDATION_AUDIT_STATUS') {
      sendResponse({
        success: true,
        running: validationAuditRunning,
        progress: validationAuditProgress,
      });
      return;
    }

    if (request?.type === 'CLEAR_VALIDATION_STATUS') {
      const cleared = await clearValidationStatus();
      sendResponse({ success: true, cleared });
      return;
    }

    if (request?.type === 'RESYNC_THREAD') {
      // Add single thread to sync queue for re-sync
      const thread = await getThreadById(request.threadId);
      if (!thread) {
        sendResponse({ success: false, error: 'Thread not found' });
        return;
      }
      await addToSyncQueue([{
        provider: thread.provider,
        provider_thread_id: thread.provider_thread_id,
        url: thread.url,
        title: thread.title,
        priority: 1, // High priority
      }]);
      sendResponse({ success: true });
      return;
    }

    // Hidden threads and duplicate detection handlers
    if (request?.type === 'HIDE_THREAD') {
      try {
        const result = await hideThread(request.threadId, request.reason || 'manual', request.duplicateOf);
        sendResponse({ success: true, thread: result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    if (request?.type === 'UNHIDE_THREAD') {
      try {
        const result = await unhideThread(request.threadId);
        sendResponse({ success: true, thread: result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    if (request?.type === 'GET_HIDDEN_THREADS') {
      try {
        const threads = await getHiddenThreads(request.options || {});
        sendResponse({ success: true, threads });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    if (request?.type === 'FIND_DUPLICATES') {
      try {
        const duplicateGroups = await findDuplicateThreads(request.options || {});
        sendResponse({ success: true, duplicateGroups });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    if (request?.type === 'AUTO_HIDE_DUPLICATES') {
      try {
        const result = await autoHideDuplicates(request.options || {});
        sendResponse({ success: true, ...result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    if (request?.type === 'UPDATE_THREAD_STATUS') {
      try {
        const thread = await getThreadById(request.threadId);
        if (thread) {
          thread.status = request.status;
          await upsertThread(thread);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Thread not found' });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    if (request?.type === 'UPDATE_THREAD_PRIORITY') {
      try {
        const thread = await getThreadById(request.threadId);
        if (thread) {
          thread.priority = request.priority;
          await upsertThread(thread);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Thread not found' });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    if (request?.type === 'UPDATE_THREAD_CATEGORY') {
      try {
        const thread = await getThreadById(request.threadId);
        if (thread) {
          thread.category = request.category;
          await upsertThread(thread);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Thread not found' });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    // ========== CLAUDE CODE CLI IMPORT ==========

    if (request?.type === 'IMPORT_CLI_THREAD') {
      // Import a single CLI thread (parsed on UI side)
      const { threadData } = request;
      try {
        const result = await processCliThread(threadData);
        sendResponse({ success: true, thread: result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    if (request?.type === 'IMPORT_CLI_BATCH') {
      // Import multiple CLI threads at once
      const { threads } = request;
      try {
        const results = { imported: 0, skipped: 0, errors: [] };
        for (const threadData of threads) {
          try {
            await processCliThread(threadData);
            results.imported++;
          } catch (err) {
            results.errors.push({
              file: threadData.metadata?.source_file || 'unknown',
              error: err.message,
            });
          }
        }
        broadcastLog('success', `CLI import: ${results.imported} threads imported`, 'success');
        sendResponse({ success: true, results });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    if (request?.type === 'GET_CLI_STATS') {
      // Get stats about imported CLI threads
      try {
        const allThreadsData = await listThreads({ source: 'cli' });
        const stats = {
          total: allThreadsData.length,
          byProvider: {},
          byCliTool: {},
          byProject: {},
        };
        for (const thread of allThreadsData) {
          stats.byProvider[thread.provider] = (stats.byProvider[thread.provider] || 0) + 1;
          const tool = thread.cli_tool || thread.metadata?.cli_tool || 'unknown';
          stats.byCliTool[tool] = (stats.byCliTool[tool] || 0) + 1;
          const project = thread.metadata?.project_name || 'unknown';
          stats.byProject[project] = (stats.byProject[project] || 0) + 1;
        }
        sendResponse({ success: true, stats });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    if (request?.type === 'NATIVE_CLI_SYNC') {
      // Communicate with native messaging host
      const { action, force } = request;
      const HOST_NAME = 'com.threadhub.claudecodesync';

      (async () => {
        try {
          // Send message to native host
          const nativeMessage = { type: action || 'status', force };
          const nativeResponse = await chrome.runtime.sendNativeMessage(HOST_NAME, nativeMessage);

          if (nativeResponse.type === 'error') {
            sendResponse({ success: false, error: nativeResponse.error });
            return;
          }

          // For status requests, just return the data
          if (action === 'status') {
            sendResponse({ success: true, data: nativeResponse });
            return;
          }

          // For sync requests, process the sessions
          if (action === 'sync' && nativeResponse.sessions) {
            const { threads, errors } = parseSessionsFromData(nativeResponse.sessions);
            const results = { imported: 0, skipped: 0, total: nativeResponse.total || 0, errors: [] };

            for (const threadData of threads) {
              try {
                const existing = await getThreadByProviderId('claude', threadData.provider_thread_id);
                if (existing) {
                  const newHash = await computeContentHash({
                    provider: threadData.provider,
                    provider_thread_id: threadData.provider_thread_id,
                    title: threadData.title,
                    messages: threadData.messages.slice(0, 5).concat(threadData.messages.slice(-5)),
                  });
                  if (existing.content_hash === newHash) {
                    results.skipped++;
                    continue;
                  }
                }
                await processCliThread(threadData);
                results.imported++;
              } catch (err) {
                results.errors.push({ file: threadData.metadata?.source_file, error: err.message });
              }
            }

            broadcastLog('cli-sync', `Native sync: ${results.imported} new, ${results.skipped} unchanged`);
            sendResponse({ success: true, data: { ...nativeResponse, synced: results.imported } });
          } else {
            sendResponse({ success: true, data: nativeResponse });
          }
        } catch (err) {
          // Native host not installed or error
          sendResponse({ success: false, error: err.message || 'Native host not available' });
        }
      })();
      return;
    }

    if (request?.type === 'DEBUG_DUMP_DB') {
      // Dump all database contents for debugging
      const threads = await listThreads({});
      const queueStats = await getSyncQueueStats();
      await loadDiscoveredChats();

      // Convert discoveredChats Map to plain object
      const discovered = {};
      for (const [providerId, chats] of discoveredChats) {
        discovered[providerId] = Array.from(chats.entries()).map(([id, chat]) => ({
          id,
          title: chat.title,
          href: chat.href,
          position: chat.position,
        }));
      }

      // Get chrome.storage.local contents
      const storageData = await chrome.storage.local.get(null);

      sendResponse({
        success: true,
        data: {
          threads: threads.map(t => ({
            id: t.id,
            provider: t.provider,
            provider_thread_id: t.provider_thread_id,
            title: t.title,
            status: t.status,
            last_synced_at: t.last_synced_at,
            messageCount: t.messages?.length || 0,
          })),
          threadCount: threads.length,
          queueStats,
          discovered,
          discoveredCount: Object.values(discovered).reduce((sum, arr) => sum + arr.length, 0),
          storageKeys: Object.keys(storageData),
        },
      });
      return;
    }
  })();
  return true;
});

/**
 * Sync a single tab (used for auto-sync on visibility change)
 */
async function syncSingleTab(tab) {
  if (!tab?.id || !tab?.url) {
    return { success: false, error: 'Invalid tab' };
  }

  const provider = detectProvider(tab.url);
  if (!provider) {
    return { success: false, error: 'Not an AI chat tab' };
  }

  try {
    const scrapeResult = await sendScrape(tab.id);
    if (!scrapeResult?.success) {
      return { success: false, error: scrapeResult?.error || 'Scrape failed' };
    }

    const threadRecord = await processScrapedThread(provider, scrapeResult);

    // Also update discovered chats from sidebar
    if (scrapeResult.chatList?.length > 0) {
      await updateDiscoveredChats(provider.id, scrapeResult.chatList);
    }

    return {
      success: true,
      synced: { tabId: tab.id, provider: provider.id, threadId: threadRecord?.id },
      chatListCount: scrapeResult.chatList?.length || 0,
    };
  } catch (err) {
    console.warn('Auto-sync failed for tab', tab.id, err);
    return { success: false, error: err.message };
  }
}

/**
 * Full sync across all open AI chat tabs
 */
async function runSync() {
  broadcastLog('sync', 'Starting manual sync...');
  const tabs = await chrome.tabs.query({});
  broadcastLog('sync', `Found ${tabs.length} total browser tabs`);

  const synced = [];
  const aiTabs = tabs.filter((t) => t.id && t.url && detectProvider(t.url));

  if (aiTabs.length === 0) {
    broadcastLog('sync', 'No AI provider tabs found (Claude/ChatGPT/Gemini/Grok)');
    return { success: true, synced };
  }

  // Summarize tabs by provider instead of listing each one
  const byProvider = {};
  aiTabs.forEach((t) => {
    const p = detectProvider(t.url);
    byProvider[p?.id || 'unknown'] = (byProvider[p?.id || 'unknown'] || 0) + 1;
  });
  const providerSummary = Object.entries(byProvider).map(([p, n]) => `${n} ${p}`).join(', ');
  broadcastLog('sync', `Found ${aiTabs.length} AI tabs (${providerSummary})`);

  let discoveredTotal = 0;
  for (const tab of aiTabs) {
    const provider = detectProvider(tab.url);
    const tabInfo = `${provider?.id} tab ${tab.id}`;

    try {
      const scrapeResult = await sendScrape(tab.id);

      if (!scrapeResult?.success) {
        broadcastLog('error', `${tabInfo}: ${scrapeResult?.error || 'scrape failed'}`, 'error');
        continue;
      }

      const msgCount = scrapeResult.messages?.length || 0;
      const title = scrapeResult.title?.slice(0, 30) || 'untitled';
      const threadRecord = await processScrapedThread(provider, scrapeResult);

      // Update discovered chats from sidebar (log summary at end)
      if (scrapeResult.chatList?.length > 0) {
        await updateDiscoveredChats(provider.id, scrapeResult.chatList);
        discoveredTotal += scrapeResult.chatList.length;
      }

      if (threadRecord) {
        synced.push({ tabId: tab.id, provider: provider.id, threadId: threadRecord.id });
        broadcastLog('scrape', `${provider.id}: "${title}" (${msgCount} msgs)`);
      }
    } catch (err) {
      broadcastLog('error', `${tabInfo}: ${err.message}`, 'error');
    }
  }

  if (discoveredTotal > 0) {
    broadcastLog('sync', `Discovered ${discoveredTotal} chats in sidebars`);
  }

  broadcastLog('success', `Sync complete: ${synced.length}/${aiTabs.length} tabs synced`, 'success');
  return { success: true, synced };
}

/**
 * Backfill attachment_types for all existing threads
 * Scans stored messages and computes types without re-syncing
 */
async function backfillAttachmentTypes() {
  broadcastLog('info', 'Starting attachment type backfill...', 'info');

  const threads = await listThreads({});
  let updated = 0;
  let skipped = 0;

  for (const thread of threads) {
    // Skip if already has attachment_types
    if (thread.attachment_types && thread.attachment_types.length > 0) {
      skipped++;
      continue;
    }

    // Get messages for this thread
    const messages = await getMessagesByThreadId(thread.id);
    const artifacts = await getArtifactsByThreadId(thread.id);

    // Compute attachment types
    const attachmentTypes = detectAttachmentTypes(messages, artifacts);

    // Update thread if types were found
    if (attachmentTypes.length > 0) {
      await updateThreadField(thread.id, { attachment_types: attachmentTypes });
      updated++;
      broadcastLog('info', `Updated "${thread.title?.slice(0, 30)}": ${attachmentTypes.join(', ')}`, 'info');
    }
  }

  broadcastLog('success', `Backfill complete: ${updated} updated, ${skipped} skipped (already had types)`, 'success');
  return { updated, skipped, total: threads.length };
}

/**
 * Check if a URL is a container page (not a real conversation)
 * Used as a fallback to content script validation
 */
function isContainerUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const host = parsed.hostname;

    // ChatGPT container pages
    if (host.includes('chatgpt.com')) {
      if (['/library', '/gpts', '/explore', '/auth'].some(p => path === p || path.startsWith(p + '/'))) return true;
      if (path === '/' || path === '') return true;
    }

    // Claude container pages
    if (host.includes('claude.ai')) {
      if (['/artifacts', '/projects', '/chats', '/recents', '/settings', '/new'].some(p => path === p || path.startsWith(p + '/'))) return true;
      if (path === '/' || path === '') return true;
    }

    // Gemini container pages
    if (host.includes('gemini.google.com')) {
      if (['/mystuff', '/gems', '/extensions', '/settings'].some(p => path === p || path.startsWith(p + '/'))) return true;
      if (path === '/' || path === '') return true;
    }

    // Grok container pages
    if (host.includes('grok.com')) {
      if (['/highlights', '/trends', '/project', '/settings'].some(p => path === p || path.startsWith(p + '/'))) return true;
      if ((path === '/' || path === '' || path === '/c') && !parsed.hash) return true;
    }

    // Copilot container pages
    if (host.includes('copilot.microsoft.com') || host.includes('m365.cloud.microsoft')) {
      if (['/discover', '/settings', '/images', '/notebooks'].some(p => path === p || path.startsWith(p + '/'))) return true;
      if (path === '/' || path === '' || path === '/chat') return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Process a scraped thread and save to storage
 */
async function processScrapedThread(provider, scrapeResult) {
  const {
    provider_thread_id,
    title,
    provider_summary,
    messages = [],
    artifacts = [],
    url,
    projects = [],
    // Extended metadata from content scripts
    github_repo,
    organization,
    created_at,
    metadata = {},
  } = scrapeResult;

  if (!provider_thread_id) return null;

  // Skip container pages (fallback check)
  if (isContainerUrl(url)) {
    broadcastLog('info', `Skipping container page: ${url}`, 'container_skip');
    return null;
  }

  const existing = await getThreadByProviderId(provider.id, provider_thread_id);
  // Embed first 5 + last 5 messages for quick preview, but deduplicate overlaps for short conversations
  const embeddedMessages = messages.length <= 10
    ? messages
    : [...messages.slice(0, 5), ...messages.slice(-5)].filter((m, i, arr) =>
        arr.findIndex(x => x.index === m.index) === i
      );

  const threadPayload = {
    provider: provider.id,
    provider_thread_id,
    title: title || 'Untitled thread',
    provider_summary,
    url,
    messages: embeddedMessages,
  };

  const contentHash = await computeContentHash(threadPayload);
  const needsAnalysis = !existing || existing.content_hash !== contentHash;

  // Build searchable content from all messages for full-text search
  const searchableContent = buildSearchableContent(messages);

  // Run local PII detection on full content
  const fullContent = [title, ...messages.map(m => m.text)].filter(Boolean).join('\n');
  const piiDetections = detectPII(fullContent);
  const piiSummary = summarizePII(piiDetections);

  // Log if critical PII found
  if (piiSummary.hasCritical) {
    broadcastLog('warning', `Thread "${title?.slice(0, 30)}" contains ${piiSummary.bySeverity.critical} critical PII items`, 'warning');
  }

  // Determine PII flags from local detection (complements AI-based flags)
  const localContainsPii = piiSummary.hasPersonalInfo || piiDetections.some(d =>
    ['email', 'phone_us', 'phone_intl', 'ssn', 'date_of_birth', 'address_us', 'passport_number', 'drivers_license'].includes(d.type)
  );
  const localContainsSecrets = piiSummary.hasSecrets || piiDetections.some(d =>
    d.type.includes('key') || d.type.includes('token') || d.type.includes('secret') || d.type.includes('password') || d.type.includes('private_key')
  );

  // Detect attachment types (code, doc, html, image, data)
  const attachmentTypes = detectAttachmentTypes(messages, artifacts);

  // Set created_at: preserve existing, or set to NOW for new threads
  // (Providers don't expose timestamps in DOM, so we use first-seen time)
  let derivedCreatedAt = existing?.created_at || created_at || new Date().toISOString();

  const threadRecord = await upsertThread({
    ...(existing || {}),
    ...threadPayload,
    content_hash: contentHash,
    searchable_content: searchableContent,
    message_count: messages.length, // Store actual message count
    status: existing?.status || 'unknown',
    // PII flags: use local detection OR existing AI-based flags
    contains_pii: localContainsPii || existing?.contains_pii || false,
    contains_legal_sensitive: existing?.contains_legal_sensitive ?? false,
    contains_customer_sensitive: existing?.contains_customer_sensitive ?? false,
    contains_hr_sensitive: existing?.contains_hr_sensitive ?? false,
    contains_security_or_secrets: localContainsSecrets || existing?.contains_security_or_secrets || false,
    // Local PII detection results
    pii_detections: piiDetections.slice(0, 50), // Store up to 50 items
    pii_summary: piiSummary,
    pii_scanned_at: new Date().toISOString(),
    attributes: existing?.attributes || {},
    is_ai_inferred_only: existing?.is_ai_inferred_only ?? true,
    // Extended metadata
    github_repo: github_repo || existing?.github_repo || null,
    organization: organization || existing?.organization || null,
    created_at: derivedCreatedAt,
    metadata: { ...(existing?.metadata || {}), ...metadata },
    // Attachment types detected in content
    attachment_types: attachmentTypes,
  });

  await upsertMessages(messages, threadRecord.id);
  await upsertArtifacts(artifacts, threadRecord.id);

  // Process discovered projects
  if (projects && projects.length > 0) {
    await processDiscoveredProjects(provider.id, projects);
  }

  if (needsAnalysis) {
    await enrichWithOpenAi(threadRecord, threadPayload);
  }

  return threadRecord;
}

/**
 * Process a CLI thread (imported from Claude Code local sessions)
 * @param {Object} threadData - Parsed CLI thread data
 * @returns {Object} Saved thread record
 */
async function processCliThread(threadData) {
  const {
    provider_thread_id,
    provider,
    source,
    cli_tool,
    title,
    messages = [],
    created_at,
    updated_at,
    github_repo,
    metadata = {},
  } = threadData;

  if (!provider_thread_id) {
    throw new Error('Missing provider_thread_id');
  }

  broadcastLog('cli-import', `Importing: "${title?.slice(0, 40) || 'untitled'}" (${cli_tool || provider})`);

  // Check for existing thread
  const existing = await getThreadByProviderId(provider, provider_thread_id);

  // Build searchable content
  const searchableContent = buildSearchableContent(messages);

  // Run PII detection
  const fullContent = [title, ...messages.map(m => m.text)].filter(Boolean).join('\n');
  const piiDetections = detectPII(fullContent);
  const piiSummary = summarizePII(piiDetections);

  // Determine PII flags
  const localContainsPii = piiSummary.hasPersonalInfo || piiDetections.some(d =>
    ['email', 'phone_us', 'phone_intl', 'ssn', 'date_of_birth', 'address_us', 'passport_number', 'drivers_license'].includes(d.type)
  );
  const localContainsSecrets = piiSummary.hasSecrets || piiDetections.some(d =>
    d.type.includes('key') || d.type.includes('token') || d.type.includes('secret') || d.type.includes('password') || d.type.includes('private_key')
  );

  // Detect attachment types (code, doc, html, image, data)
  const attachmentTypes = detectAttachmentTypes(messages, []);

  // Build thread payload for hashing
  const threadPayload = {
    provider,
    provider_thread_id,
    title: title || 'Claude Code Session',
    messages: messages.slice(0, 5).concat(messages.slice(-5)),
  };
  const contentHash = await computeContentHash(threadPayload);
  const needsAnalysis = !existing || existing.content_hash !== contentHash;

  // Save thread
  const threadRecord = await upsertThread({
    ...(existing || {}),
    provider,
    provider_thread_id,
    source: 'cli',
    cli_tool: cli_tool || 'claude-code',
    title: title || 'Claude Code Session',
    content_hash: contentHash,
    searchable_content: searchableContent,
    message_count: messages.length,
    status: existing?.status || 'unknown',
    // PII flags
    contains_pii: localContainsPii || existing?.contains_pii || false,
    contains_security_or_secrets: localContainsSecrets || existing?.contains_security_or_secrets || false,
    pii_detections: piiDetections.slice(0, 50),
    pii_summary: piiSummary,
    pii_scanned_at: new Date().toISOString(),
    // Extended metadata
    github_repo: github_repo || existing?.github_repo || null,
    created_at: created_at || existing?.created_at || new Date().toISOString(),
    updated_at: updated_at || new Date().toISOString(),
    metadata: { ...(existing?.metadata || {}), ...metadata },
    is_ai_inferred_only: existing?.is_ai_inferred_only ?? true,
    // Attachment types detected in content
    attachment_types: attachmentTypes,
  });

  // Save messages
  await upsertMessages(messages, threadRecord.id);

  // Run AI classification if content changed
  if (needsAnalysis) {
    await enrichWithOpenAi(threadRecord, threadPayload);
  }

  broadcastLog('success', `Imported CLI thread: ${threadRecord.id.slice(0, 8)}...`, 'success');
  return threadRecord;
}

/**
 * Process discovered projects from content scripts
 */
async function processDiscoveredProjects(providerId, projects) {
  let savedCount = 0;
  let failedCount = 0;
  const savedNames = [];

  for (const projectInfo of projects) {
    try {
      // Check if project already exists
      const existing = await getProjectByProviderId(providerId, projectInfo.provider_project_id);

      const projectRecord = await upsertProject({
        ...(existing || {}),
        provider: providerId,
        provider_project_id: projectInfo.provider_project_id,
        name: projectInfo.name || existing?.name || 'Unnamed Project',
        description: projectInfo.description || existing?.description || '',
        href: projectInfo.href,
        type: projectInfo.type || 'project',
        metadata: {
          ...(existing?.metadata || {}),
          isCurrent: projectInfo.isCurrent || false,
        },
      });

      savedCount++;
      savedNames.push(projectRecord.name);
    } catch (err) {
      failedCount++;
      console.error(`Failed to save project ${projectInfo.provider_project_id}:`, err.message);
    }
  }

  // Log summary instead of individual entries
  if (savedCount > 0) {
    const preview = savedNames.slice(0, 3).join(', ');
    const more = savedNames.length > 3 ? ` +${savedNames.length - 3} more` : '';
    broadcastLog('info', `${providerId}: ${savedCount} projects (${preview}${more})`);
  }
  if (failedCount > 0) {
    broadcastLog('error', `${providerId}: ${failedCount} projects failed to save`, 'error');
  }
}

/**
 * Discover all chats from sidebars without syncing content
 */
async function discoverAllChats() {
  const tabs = await chrome.tabs.query({});
  const discovered = { providers: {}, total: 0 };

  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    const provider = detectProvider(tab.url);
    if (!provider) continue;

    try {
      const scrapeResult = await sendScrape(tab.id);
      if (!scrapeResult?.success) continue;

      const chatList = scrapeResult.chatList || [];
      if (chatList.length > 0) {
        await updateDiscoveredChats(provider.id, chatList);

        if (!discovered.providers[provider.id]) {
          discovered.providers[provider.id] = [];
        }
        discovered.providers[provider.id].push(...chatList);
        discovered.total += chatList.length;
      }
    } catch (err) {
      console.warn('Discovery failed for tab', tab.id, err);
    }
  }

  return { success: true, discovered };
}

/**
 * Update discovered chats with position tracking
 */
async function updateDiscoveredChats(providerId, chatList) {
  await loadDiscoveredChats(); // Ensure we have latest state

  if (!discoveredChats.has(providerId)) {
    discoveredChats.set(providerId, new Map());
  }

  const providerChats = discoveredChats.get(providerId);
  const now = Date.now();

  // Filter out container URLs before processing
  const filteredChatList = chatList.filter((chat) => {
    const url = chat.href?.startsWith('http') ? chat.href : `https://${providerId}.com${chat.href}`;
    return !isContainerUrl(url);
  });

  filteredChatList.forEach((chat, position) => {
    const existing = providerChats.get(chat.id);

    if (existing) {
      // Chat existed - check if position changed (moved up = recently active)
      const movedUp = position < existing.position;
      providerChats.set(chat.id, {
        ...existing,
        ...chat,
        position,
        lastSeen: now,
        movedUp,
        previousPosition: existing.position,
      });
    } else {
      // New chat discovered
      providerChats.set(chat.id, {
        ...chat,
        position,
        firstSeen: now,
        lastSeen: now,
        movedUp: false,
        isNew: true,
      });
    }
  });

  await saveDiscoveredChats(); // Persist changes
}

/**
 * Get discovered chats with change indicators
 */
async function getDiscoveredWithChanges() {
  await loadDiscoveredChats(); // Ensure we have latest state
  const result = {};

  for (const [providerId, chats] of discoveredChats) {
    result[providerId] = Array.from(chats.values())
      .sort((a, b) => a.position - b.position)
      .map((chat) => ({
        id: chat.id,
        title: chat.title,
        href: chat.href,
        position: chat.position,
        hasChanges: chat.movedUp || chat.isNew,
        isNew: chat.isNew || false,
        movedUp: chat.movedUp || false,
      }));
  }

  return { success: true, discovered: result };
}

/**
 * Get content scripts for a provider
 */
function getScriptsForProvider(providerId) {
  const base = ['shared/logger.js', 'shared/auto-sync.js'];
  const contentScript = `content/${providerId}.js`;
  return [...base, contentScript];
}

/**
 * Inject content scripts into a tab programmatically
 */
async function injectContentScripts(tabId, url) {
  const provider = detectProvider(url);
  if (!provider) {
    broadcastLog('error', `Tab ${tabId}: Unknown provider for ${url.slice(0, 50)}`, 'error');
    return false;
  }

  const files = getScriptsForProvider(provider.id);

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files,
    });
    // Give scripts a moment to initialize
    await new Promise((r) => setTimeout(r, 100));
    return true;
  } catch (err) {
    // Only log errors, not routine injections
    broadcastLog('error', `Tab ${tabId} (${provider.id}): injection failed - ${err.message}`, 'error');
    console.error(`[Scrape] Injection failed for tab ${tabId}:`, err, 'URL:', url);
    return false;
  }
}

/**
 * Try sending a message to a tab's content script
 */
function trySendMessage(tabId, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: 'timeout' });
      }
    }, timeoutMs);

    chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_THREAD' }, (response) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);

      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

/**
 * Send scrape request to a tab, injecting content scripts if needed
 */
async function sendScrape(tabId, timeoutMs = 10000) {
  // First, try to send message directly (content script may already be loaded)
  let result = await trySendMessage(tabId, 3000);

  if (result?.success) {
    return result;
  }

  // If failed, the content script might not be loaded - inject it
  if (result?.error?.includes('Receiving end does not exist') || result?.error === 'timeout') {
    // Get tab URL for provider detection
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url) {
      return { success: false, error: 'Could not get tab URL' };
    }

    const injected = await injectContentScripts(tabId, tab.url);
    if (!injected) {
      return { success: false, error: 'Failed to inject content scripts' };
    }

    result = await trySendMessage(tabId, timeoutMs - 3000);
  }

  return result;
}

async function enrichWithOpenAi(threadRecord, threadPayload) {
  try {
    const customColumns = await getCustomColumns();

    // Build minimal payload for classification - only first user message for efficiency
    const messages = threadPayload.messages || [];
    const firstUserMessage = messages.find(m => m.role === 'user');
    const classificationPayload = {
      provider: threadPayload.provider,
      provider_thread_id: threadPayload.provider_thread_id,
      title: threadPayload.title,
      provider_summary: threadPayload.provider_summary,
      first_message: threadPayload.first_message || firstUserMessage?.content?.slice(0, 2000) || '',
    };

    const aiResult = await classifyThread(classificationPayload, customColumns);
    if (!aiResult) return;
    const updated = {
      ...threadRecord,
      ai_summary: aiResult.ai_summary,
      status: aiResult.status || 'new',
      category: aiResult.category || 'other',
      tags: Array.isArray(aiResult.tags) ? aiResult.tags : [],
      priority: aiResult.priority || 'medium',
      outcome_prediction: aiResult.outcome_prediction,
      progress_stage: aiResult.progress_stage,
      suggested_next_step: aiResult.suggested_next_step,
      contains_pii: Boolean(aiResult.contains_pii),
      contains_legal_sensitive: Boolean(aiResult.contains_legal_sensitive),
      contains_customer_sensitive: Boolean(aiResult.contains_customer_sensitive),
      contains_hr_sensitive: Boolean(aiResult.contains_hr_sensitive),
      contains_security_or_secrets: Boolean(aiResult.contains_security_or_secrets),
      attributes: aiResult.custom_attributes || threadRecord.attributes || {},
      is_ai_inferred_only: true,
    };
    await upsertThread(updated);
  } catch (err) {
    console.warn('Classification failed', err);
  }
}

/**
 * Re-run AI tagging on existing threads
 */
async function retagThreads(threadIds = null) {
  broadcastLog('retag', 'Starting re-tag operation...');

  let threads;
  if (threadIds && threadIds.length > 0) {
    // Specific threads
    threads = [];
    for (const id of threadIds) {
      const thread = await getThreadById(id);
      if (thread) threads.push(thread);
    }
    broadcastLog('retag', `Re-tagging ${threads.length} specific threads`);
  } else {
    // All threads
    threads = await listThreads({});
    broadcastLog('retag', `Re-tagging all ${threads.length} threads`);
  }

  let success = 0;
  let failed = 0;
  const total = threads.length;

  // Broadcast progress updates to all extension pages
  function broadcastProgress(current, threadTitle, threadId) {
    chrome.runtime.sendMessage({
      type: 'RETAG_PROGRESS',
      current,
      total,
      success,
      failed,
      threadTitle,
      threadId,
    }).catch(() => {}); // Ignore errors if no listeners
  }

  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i];
    try {
      // Get messages for the thread
      const messages = await getMessagesByThreadId(thread.id);

      // Build payload for classification - only use first user message for efficiency
      const firstUserMessage = messages.find(m => m.role === 'user');
      const threadPayload = {
        provider: thread.provider,
        provider_thread_id: thread.provider_thread_id,
        title: thread.title,
        provider_summary: thread.provider_summary,
        first_message: firstUserMessage?.content?.slice(0, 2000) || '', // Limit to 2k chars
      };

      const shortTitle = thread.title?.slice(0, 40) || 'untitled';
      broadcastLog('retag', `Classifying: "${shortTitle}"`);
      broadcastProgress(i + 1, shortTitle, thread.id);

      await enrichWithOpenAi(thread, threadPayload);
      success++;
    } catch (err) {
      broadcastLog('error', `Failed to retag thread ${thread.id}: ${err.message}`, 'error');
      failed++;
    }

    // Small delay to avoid rate limiting
    await sleep(500);
  }

  broadcastLog('success', `Re-tag complete: ${success} success, ${failed} failed`, 'success');
  return { success: true, total: threads.length, succeeded: success, failed };
}

// ============================================================
// Background Sync Queue Loop
// ============================================================

/**
 * Add all discovered chats to the sync queue
 * Prioritizes the provider of the currently active tab
 */
async function queueDiscoveredChats() {
  await loadDiscoveredChats(); // Ensure we have latest state
  const toQueue = [];

  // Get active tab to determine priority provider
  let priorityProvider = null;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.url) {
      const provider = detectProvider(activeTab.url);
      priorityProvider = provider?.id || null;
    }
  } catch (e) {
    broadcastLog('error', `Failed to get active tab: ${e.message}`);
  }

  broadcastLog('queue', `Queueing discovered chats...`);
  broadcastLog('queue', `Providers with discovered chats: ${discoveredChats.size}`);

  for (const [providerId, chats] of discoveredChats) {
    broadcastLog('queue', `${providerId}: ${chats.size} chats discovered`);
    for (const [chatId, chat] of chats) {
      // Build URL for this chat
      const url = getProviderUrlForChat(providerId, chatId, chat.href);

      // Debug: log URL construction
      if (url && url.includes('/c/c/')) {
        broadcastLog('error', `Bad URL detected: ${url} (chatId=${chatId}, href=${chat.href})`, 'error');
      }

      if (url) {
        toQueue.push({
          provider: providerId,
          provider_thread_id: chatId,
          url,
          title: chat.title,
          priority: providerId === priorityProvider ? 1 : 0,
        });
      }
    }
  }

  if (toQueue.length === 0) {
    broadcastLog('queue', 'No chats to queue');
    return { success: true, queued: 0, message: 'No chats to queue' };
  }

  // Sort: priority provider first, then others
  if (priorityProvider) {
    toQueue.sort((a, b) => {
      if (a.provider === priorityProvider && b.provider !== priorityProvider) return -1;
      if (b.provider === priorityProvider && a.provider !== priorityProvider) return 1;
      return 0;
    });
  }

  broadcastLog('queue', `Adding ${toQueue.length} chats to queue...`);
  const added = await addToSyncQueue(toQueue);
  broadcastLog('success', `Queued ${added.length} new chats (${toQueue.length - added.length} already queued)`, 'success');

  return {
    success: true,
    queued: added.length,
    total: toQueue.length,
    message: `Added ${added.length} new chats to queue (${toQueue.length - added.length} already queued)`,
  };
}

/**
 * Start the background sync loop
 */
function startSyncLoop(delayMs = DEFAULT_SYNC_DELAY_MS) {
  if (syncLoopRunning) {
    broadcastLog('queue', 'Sync loop already running');
    return;
  }

  syncLoopRunning = true;
  syncLoopPaused = false;
  broadcastLog('queue', `Starting sync loop (${delayMs / 1000}s delay between items)`);

  runSyncLoop(delayMs);
}

/**
 * Stop the sync loop
 */
function stopSyncLoop() {
  broadcastLog('queue', 'Stopping sync loop...');
  syncLoopRunning = false;
  syncLoopPaused = false;

  // Close the sync tab if it exists
  if (syncLoopTabId) {
    chrome.tabs.remove(syncLoopTabId).catch(() => {});
    syncLoopTabId = null;
  }
}

/**
 * Main sync loop - processes queue items one at a time with retry logic
 */
const SYNC_LOOP_CONFIG = {
  MAX_ATTEMPTS: 3,
  RETRY_DELAY_MS: 5000, // Wait 5s before retry
  MIN_MESSAGE_COUNT: 2, // Expect at least 2 messages (user + assistant)
  LOW_MESSAGE_RETRY_DELAY_MS: 2000, // Extra wait before retry on low message count
};

async function runSyncLoop(delayMs) {
  broadcastLog('queue', 'Background sync loop started');
  syncHealth.startedAt = Date.now();

  while (syncLoopRunning) {
    // Check if paused
    if (syncLoopPaused) {
      await sleep(1000);
      continue;
    }

    // Get next item from queue
    const item = await getNextFromQueue();

    if (!item) {
      broadcastLog('queue', 'Queue empty, sync loop complete');
      syncLoopRunning = false;
      break;
    }

    const itemInfo = `"${item.title?.slice(0, 30) || 'untitled'}" (${item.provider})`;

    // Check if thread was already synced recently (within last hour)
    const existingThread = await getThreadByProviderId(item.provider, item.provider_thread_id);
    if (existingThread?.synced_at) {
      const hourAgo = Date.now() - 60 * 60 * 1000;
      if (new Date(existingThread.synced_at).getTime() > hourAgo) {
        broadcastLog('queue', `Skipping ${itemInfo} - synced recently`);
        await updateQueueItemStatus(item.id, 'completed');
        updateHealthMetrics(true, 0);
        continue;
      }
    }

    // Check if there's already an open tab for this URL (use it instead of opening new)
    let existingTab = null;
    try {
      const allTabs = await chrome.tabs.query({});
      existingTab = allTabs.find(t => t.url && t.url.includes(item.provider_thread_id));
    } catch (e) {
      // Ignore - will open new tab
    }

    broadcastLog('queue', `Processing: ${itemInfo}${existingTab ? ' (using open tab)' : ''}`);

    // Retry loop for this item
    let attempt = 0;
    let success = false;
    let lastError = null;
    let lastErrorType = null;
    let messageCount = 0;

    while (attempt < SYNC_LOOP_CONFIG.MAX_ATTEMPTS && !success) {
      attempt++;
      const attemptStartTime = Date.now();
      let tab = existingTab;
      let shouldCloseTab = !existingTab; // Only close if we opened it

      try {
        // Mark as syncing
        await updateQueueItemStatus(item.id, 'syncing');

        // Use existing tab or open new one
        if (!tab) {
          tab = await chrome.tabs.create({
            url: item.url,
            active: false, // Open in background
          });
        }
        syncLoopTabId = tab.id;

        // Wait for page to load
        await waitForTabLoad(tab.id, 30000);

        // Additional wait for dynamic content
        await sleep(3000);

        // Scrape the thread
        const scrapeResult = await sendScrape(tab.id);

        if (scrapeResult?.success) {
          messageCount = scrapeResult.messages?.length || 0;

          // Validate message count - if too low, might be incomplete extraction
          if (messageCount < SYNC_LOOP_CONFIG.MIN_MESSAGE_COUNT && attempt < SYNC_LOOP_CONFIG.MAX_ATTEMPTS) {
            const durationMs = Date.now() - attemptStartTime;
            broadcastLog('warning', `${itemInfo}: Only ${messageCount} messages extracted, retrying...`, 'warning');

            logScrapeAttempt({
              item,
              attempt,
              maxAttempts: SYNC_LOOP_CONFIG.MAX_ATTEMPTS,
              durationMs,
              success: false,
              messageCount,
              error: new Error(`Low message count: ${messageCount}`),
              willRetry: true,
            });

            // Close tab if we opened it, before retrying
            if (shouldCloseTab && tab?.id) {
              await chrome.tabs.remove(tab.id).catch(() => {});
            }
            syncLoopTabId = null;
            existingTab = null; // Don't reuse tab on retry

            // Wait a bit longer for content to load on retry
            await sleep(SYNC_LOOP_CONFIG.LOW_MESSAGE_RETRY_DELAY_MS);
            continue; // Try again
          }

          // Process and save
          const provider = detectProvider(item.url);
          if (provider) {
            await processScrapedThread(provider, scrapeResult);
          }
          await updateQueueItemStatus(item.id, 'completed');
          success = true;

          // Log success with structured format
          const durationMs = Date.now() - attemptStartTime;
          logScrapeAttempt({
            item,
            attempt,
            maxAttempts: SYNC_LOOP_CONFIG.MAX_ATTEMPTS,
            durationMs,
            success: true,
            messageCount,
          });
          updateHealthMetrics(true, durationMs);

          // Log warning if message count is still low but we're done retrying
          if (messageCount < SYNC_LOOP_CONFIG.MIN_MESSAGE_COUNT) {
            broadcastLog('warning', `${itemInfo}: Saved with only ${messageCount} messages`, 'warning');
          }

        } else {
          throw new Error(scrapeResult?.error || 'Scrape failed');
        }

        // Close the tab only if we opened it
        if (shouldCloseTab && tab?.id) {
          await chrome.tabs.remove(tab.id).catch(() => {});
        }
        syncLoopTabId = null;

      } catch (err) {
        lastError = err;
        lastErrorType = classifyError(err);
        const durationMs = Date.now() - attemptStartTime;
        const errorConfig = ERROR_TYPES[lastErrorType] || ERROR_TYPES.UNKNOWN;
        const willRetry = errorConfig.retry && attempt < SYNC_LOOP_CONFIG.MAX_ATTEMPTS;

        // Log attempt with structured format
        logScrapeAttempt({
          item,
          attempt,
          maxAttempts: SYNC_LOOP_CONFIG.MAX_ATTEMPTS,
          durationMs,
          error: err,
          success: false,
          willRetry,
        });

        // Close tab on error only if we opened it
        if (shouldCloseTab && tab?.id) {
          await chrome.tabs.remove(tab.id).catch(() => {});
        }
        syncLoopTabId = null;

        // Check if we should stop the queue (e.g., auth required)
        if (errorConfig.stopQueue) {
          broadcastLog('error', `Stopping queue: ${ERROR_TYPES[lastErrorType].description}`, 'error');
          syncLoopRunning = false;
          break;
        }

        // Check if this error type is retryable
        if (!errorConfig.retry) {
          broadcastLog('info', `Not retrying ${lastErrorType}: ${errorConfig.description}`);
          break;
        }

        // Wait before retry (if we have retries left)
        if (willRetry) {
          syncHealth.retryCount++;
          const retryDelay = SYNC_LOOP_CONFIG.RETRY_DELAY_MS * attempt;
          broadcastLog('queue', `Retry ${attempt}/${SYNC_LOOP_CONFIG.MAX_ATTEMPTS} in ${retryDelay / 1000}s...`);
          await sleep(retryDelay);
        }
      }
    }

    // If all attempts failed, mark as failed
    if (!success && syncLoopRunning) {
      await updateQueueItemStatus(item.id, 'failed', lastError?.message || 'Max retries exceeded');
      updateHealthMetrics(false, 0, lastErrorType, lastError?.message);
    }

    // Adaptive delay before next item (only if loop is still running)
    if (syncLoopRunning && !syncLoopPaused) {
      const adaptiveDelay = calculateAdaptiveDelay(
        syncHealth.consecutiveFailures,
        syncHealth.consecutiveSuccesses,
        lastErrorType
      );
      const delaySeconds = Math.round(adaptiveDelay / 1000);
      const healthStatus = getSyncHealth().status;
      broadcastLog('queue', `Next in ${delaySeconds}s (${healthStatus}, ${syncHealth.successCount}✓ ${syncHealth.failCount}✗)`);
      await sleep(adaptiveDelay);
    }
  }

  const health = getSyncHealth();
  broadcastLog('queue', `Sync loop ended - ${health.successCount} success, ${health.failCount} failed, ${health.successRate}% rate`);
}

/**
 * Wait for a tab to finish loading
 */
function waitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkTab = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error('Tab closed'));
          return;
        }

        if (tab.status === 'complete') {
          resolve(tab);
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          reject(new Error('Tab load timeout'));
          return;
        }

        setTimeout(checkTab, 500);
      });
    };

    checkTab();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Migrate threads without created_at (one-time backfill)
async function migrateCreatedAt() {
  try {
    const allThreads = await listThreads({});
    let migrated = 0;
    for (const thread of allThreads) {
      if (!thread.created_at && thread.last_synced_at) {
        await updateThreadField(thread.id, { created_at: thread.last_synced_at });
        migrated++;
      }
    }
    if (migrated > 0) {
      console.log(`[Migration] Backfilled created_at for ${migrated} threads`);
    }
  } catch (err) {
    console.warn('[Migration] created_at backfill failed:', err);
  }
}

// Resume sync loop on extension startup if there are pending items
chrome.runtime.onStartup.addListener(async () => {
  try {
    // Run migrations
    await migrateCreatedAt();

    const stats = await getSyncQueueStats();
    if (stats.pending > 0 || stats.syncing > 0) {
      console.log(`[SyncLoop] Found ${stats.pending} pending, ${stats.syncing} syncing items`);
      // Reset any "syncing" items back to pending (interrupted by restart)
      await resetFailedInQueue();
    }
  } catch (err) {
    console.warn('[SyncLoop] Startup check failed:', err);
  }
});

// Also run migration on install/update
chrome.runtime.onInstalled.addListener(async () => {
  await migrateCreatedAt();
  // Setup Obsidian sync alarm if configured
  const obsidianConfig = await getObsidianConfigFromStorage();
  if (obsidianConfig.enabled && obsidianConfig.method === 'obsidian-rest-api') {
    await setupObsidianSyncAlarm(obsidianConfig);
  }
});

// ============================================================
// Embedding Generation
// ============================================================

/**
 * Generate embeddings for threads
 * @param {string[]|null} threadIds - Specific threads, or null for all
 * @param {boolean} forceRegenerate - Regenerate even if exists
 */
async function generateThreadEmbeddings(threadIds = null, forceRegenerate = false) {
  broadcastLog('embeddings', 'Starting embedding generation...');

  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      return { success: false, error: 'OpenAI API key not configured' };
    }

    // Get threads to process
    let threads;
    if (threadIds && threadIds.length > 0) {
      threads = [];
      for (const id of threadIds) {
        const thread = await getThreadById(id);
        if (thread) threads.push(thread);
      }
    } else {
      threads = await listThreads({});
    }

    if (threads.length === 0) {
      return { success: true, generated: 0, skipped: 0, message: 'No threads to process' };
    }

    // Get existing embeddings
    const existingEmbeddings = await getAllEmbeddings();
    const existingMap = new Map(existingEmbeddings.map((e) => [e.thread_id, e]));

    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < threads.length; i++) {
      const thread = threads[i];

      try {
        // Prepare text for embedding
        const text = prepareThreadText(thread);
        if (!text || text.trim().length < 10) {
          skipped++;
          continue;
        }

        const textHash = computeTextHash(text);

        // Check if embedding already exists and is current
        const existing = existingMap.get(thread.id);
        if (existing && existing.input_hash === textHash && !forceRegenerate) {
          skipped++;
          continue;
        }

        // Generate embedding
        const embedding = await generateEmbedding(text, apiKey);

        // Save to storage
        await saveEmbedding(thread.id, embedding, EMBEDDING_MODEL, textHash);
        generated++;

        // Broadcast progress
        chrome.runtime.sendMessage({
          type: 'EMBEDDING_PROGRESS',
          current: i + 1,
          total: threads.length,
          generated,
          skipped,
          threadTitle: thread.title,
        }).catch(() => {});

        // Small delay to avoid rate limiting
        if (i < threads.length - 1) {
          await sleep(50);
        }
      } catch (err) {
        failed++;
        broadcastLog('error', `Failed to embed "${thread.title?.slice(0, 30)}": ${err.message}`, 'error');
      }
    }

    broadcastLog('success', `Embeddings complete: ${generated} generated, ${skipped} skipped, ${failed} failed`, 'success');

    return {
      success: true,
      generated,
      skipped,
      failed,
      total: threads.length,
    };
  } catch (err) {
    broadcastLog('error', `Embedding generation failed: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

/**
 * Get data for visualization
 * @param {number} similarityThreshold - Minimum similarity for edges
 */
async function getVisualizationData(similarityThreshold = 0.8) {
  try {
    // Get all threads and embeddings
    const threads = await listThreads({});
    const embeddings = await getAllEmbeddings();
    const threadLinks = await getAllThreadLinks();

    // Dedupe threads by ID
    const threadMap = new Map();
    for (const t of threads) {
      if (!threadMap.has(t.id)) {
        threadMap.set(t.id, t);
      }
    }
    const uniqueThreads = Array.from(threadMap.values());

    // Create map of thread_id -> embedding
    const embeddingMap = new Map(embeddings.map((e) => [e.thread_id, e]));

    // Build edges from thread links (dedupe)
    const edgeSet = new Set();
    const edges = [];
    for (const l of threadLinks) {
      const key = `${l.source_thread_id}-${l.target_thread_id}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({
          source: l.source_thread_id,
          target: l.target_thread_id,
          type: 'link',
          linkType: l.link_type,
        });
      }
    }

    // Add similarity edges (only for threads with embeddings)
    const similarityEdges = buildSimilarityEdges(embeddings, similarityThreshold);
    for (const e of similarityEdges) {
      const key1 = `${e.source}-${e.target}`;
      const key2 = `${e.target}-${e.source}`;
      if (!edgeSet.has(key1) && !edgeSet.has(key2)) {
        edgeSet.add(key1);
        edges.push(e);
      }
    }

    // Track which threads have connections
    const connectedIds = new Set();
    for (const e of edges) {
      connectedIds.add(e.source);
      connectedIds.add(e.target);
    }

    // Get threads with embeddings for projection
    const threadsWithEmbeddings = uniqueThreads.filter((t) => embeddingMap.has(t.id));
    const embeddingVectors = threadsWithEmbeddings.map((t) => embeddingMap.get(t.id).embedding);

    // Project to 2D if we have embeddings
    const projected = embeddingVectors.length > 0 ? projectTo2D(embeddingVectors) : [];

    // Group threads by category for layout
    const categories = [...new Set(uniqueThreads.map((t) => t.category || 'other'))];
    const categoryIndex = new Map(categories.map((c, i) => [c, i]));

    // Build nodes with better positioning
    const nodes = uniqueThreads.map((thread) => {
      const embIdx = threadsWithEmbeddings.findIndex((t) => t.id === thread.id);
      const hasEmbedding = embIdx >= 0;
      const hasConnection = connectedIds.has(thread.id);
      const catIdx = categoryIndex.get(thread.category || 'other');

      // Position: use projection for embedded threads, category grid for others
      let x, y;
      if (hasEmbedding && projected[embIdx]) {
        x = projected[embIdx][0];
        y = projected[embIdx][1];
      } else {
        // Place non-embedded threads in a grid by category on the right side
        const col = catIdx % 3;
        const row = Math.floor(catIdx / 3);
        x = 0.7 + (col * 0.15) + (Math.random() * 0.1 - 0.05);
        y = -0.8 + (row * 0.4) + (Math.random() * 0.2 - 0.1);
      }

      // Extract first line and first message for display
      const content = thread.searchable_content || thread.ai_summary || '';
      const firstLine = content.split('\n').find(l => l.trim())?.slice(0, 100) || '';
      const firstMessage = content.slice(0, 300);

      return {
        id: thread.id,
        title: thread.title,
        provider: thread.provider,
        status: thread.status,
        category: thread.category || 'other',
        tags: thread.tags || [],
        message_count: thread.message_count || 0,
        hasEmbedding,
        hasConnection,
        firstLine,
        firstMessage,
        summary: thread.ai_summary || thread.provider_summary || '',
        created_at: thread.created_at,
        x,
        y,
      };
    });

    // Compute similarity scores for each node (top 5 similar)
    const nodeWithSimilar = nodes.map((node) => {
      const embedding = embeddingMap.get(node.id);
      if (!embedding) return { ...node, similarThreads: [] };

      const similarities = [];
      for (const other of embeddings) {
        if (other.thread_id === node.id) continue;
        const sim = cosineSimilarity(embedding.embedding, other.embedding);
        if (sim >= 0.7) {
          const otherNode = nodes.find(n => n.id === other.thread_id);
          if (otherNode) {
            similarities.push({ id: other.thread_id, title: otherNode.title, similarity: sim });
          }
        }
      }
      similarities.sort((a, b) => b.similarity - a.similarity);
      return { ...node, similarThreads: similarities.slice(0, 5) };
    });

    return {
      success: true,
      nodes: nodeWithSimilar,
      edges,
      embeddingsCount: embeddings.length,
      threadsCount: uniqueThreads.length,
      connectedCount: connectedIds.size,
      categories,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// Obsidian Sync with Alarms
// ============================================================

const OBSIDIAN_ALARM_NAME = 'obsidian-sync';
const CLAUDE_CODE_ALARM_NAME = 'claude-code-sync';

/**
 * Get Obsidian config from storage
 */
async function getObsidianConfigFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get('obsidian', (result) => {
      resolve(result.obsidian || {
        enabled: false,
        method: 'obsidian-rest-api',
        apiEndpoint: 'https://127.0.0.1:27124',
        apiKey: '',
        targetFolder: 'AI Threads',
        folderStructure: 'by-provider',
        includeMessages: 'summary-only',
        syncIntervalMinutes: 30,
      });
    });
  });
}

/**
 * Setup or clear the Obsidian sync alarm based on config
 */
async function setupObsidianSyncAlarm(config) {
  // Clear existing alarm
  await chrome.alarms.clear(OBSIDIAN_ALARM_NAME);

  if (config.enabled && config.method === 'obsidian-rest-api') {
    const intervalMinutes = Math.max(5, Math.min(1440, config.syncIntervalMinutes || 30));
    await chrome.alarms.create(OBSIDIAN_ALARM_NAME, {
      delayInMinutes: 1, // Run first sync after 1 minute
      periodInMinutes: intervalMinutes,
    });
    broadcastLog('obsidian', `Obsidian sync alarm set for every ${intervalMinutes} minutes`);
  } else {
    broadcastLog('obsidian', 'Obsidian sync alarm cleared (disabled or download-only mode)');
  }
}

// ============================================================
// Claude Code Sync with Alarms
// ============================================================

/**
 * Get Claude Code config from storage
 */
async function getClaudeCodeConfigFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get('claudeCode', (result) => {
      resolve(result.claudeCode || {
        autoSyncEnabled: false,
        syncIntervalMinutes: 5,
      });
    });
  });
}

/**
 * Setup or clear the Claude Code sync alarm based on config
 */
async function setupClaudeCodeSyncAlarm(config) {
  // Clear existing alarm
  await chrome.alarms.clear(CLAUDE_CODE_ALARM_NAME);

  if (config.autoSyncEnabled) {
    const intervalMinutes = Math.max(1, Math.min(60, config.syncIntervalMinutes || 5));
    await chrome.alarms.create(CLAUDE_CODE_ALARM_NAME, {
      delayInMinutes: 1, // Run first sync after 1 minute
      periodInMinutes: intervalMinutes,
    });
    broadcastLog('cli-sync', `Claude Code sync alarm set for every ${intervalMinutes} minutes`);
  } else {
    broadcastLog('cli-sync', 'Claude Code sync alarm cleared (auto-sync disabled)');
  }
}

/**
 * Run Claude Code sync via native messaging host
 */
async function runClaudeCodeSync() {
  broadcastLog('cli-sync', 'Starting Claude Code sync...');

  const HOST_NAME = 'com.threadhub.claudecodesync';

  try {
    // Send sync request to native host
    const nativeResponse = await chrome.runtime.sendNativeMessage(HOST_NAME, { type: 'sync' });

    if (nativeResponse.type === 'error') {
      broadcastLog('cli-sync', `Native host error: ${nativeResponse.error}`, 'error');
      return { success: false, error: nativeResponse.error };
    }

    // Process any sessions returned
    if (nativeResponse.sessions && nativeResponse.sessions.length > 0) {
      const { threads } = parseSessionsFromData(nativeResponse.sessions);
      const results = { imported: 0, skipped: 0 };

      for (const threadData of threads) {
        try {
          const existing = await getThreadByProviderId('claude', threadData.provider_thread_id);
          if (existing) {
            const newHash = await computeContentHash({
              provider: threadData.provider,
              provider_thread_id: threadData.provider_thread_id,
              title: threadData.title,
              messages: threadData.messages.slice(0, 5).concat(threadData.messages.slice(-5)),
            });
            if (existing.content_hash === newHash) {
              results.skipped++;
              continue;
            }
          }
          await processCliThread(threadData);
          results.imported++;
        } catch (err) {
          broadcastLog('cli-sync', `Error processing thread: ${err.message}`, 'error');
        }
      }

      broadcastLog('cli-sync', `Sync complete: ${results.imported} new, ${results.skipped} unchanged`);
      return { success: true, imported: results.imported, skipped: results.skipped };
    }

    broadcastLog('cli-sync', 'Sync complete: no new sessions');
    return { success: true, imported: 0, skipped: nativeResponse.unchanged || 0 };
  } catch (err) {
    broadcastLog('cli-sync', `Sync failed: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

/**
 * Run Obsidian sync - fetches threads and syncs to Obsidian
 */
async function runObsidianSync() {
  broadcastLog('obsidian', 'Starting Obsidian sync...');

  try {
    const config = await getObsidianConfigFromStorage();

    if (!config.enabled) {
      return { success: false, error: 'Obsidian sync is not enabled' };
    }

    if (config.method !== 'obsidian-rest-api') {
      return { success: false, error: 'Obsidian sync requires REST API method' };
    }

    // Test connection
    const endpoint = config.apiEndpoint.replace(/\/$/, '');
    let connectionOk = false;
    let vaultName = 'Unknown';

    try {
      const testResponse = await fetch(endpoint + '/', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
      });

      if (testResponse.ok) {
        const data = await testResponse.json();
        vaultName = data.name || data.vault || 'Unknown';
        connectionOk = true;
      } else if (testResponse.status === 401) {
        return { success: false, error: 'Invalid Obsidian API key' };
      }
    } catch (err) {
      return { success: false, error: `Cannot connect to Obsidian: ${err.message}` };
    }

    if (!connectionOk) {
      return { success: false, error: 'Cannot connect to Obsidian' };
    }

    broadcastLog('obsidian', `Connected to vault: ${vaultName}`);

    // Get all threads
    const threads = await listThreads({});
    const syncStates = await getAllObsidianSyncStates();

    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (const thread of threads) {
      try {
        // Compute content hash for change detection
        const contentForHash = JSON.stringify({
          title: thread.title,
          ai_summary: thread.ai_summary,
          status: thread.status,
          category: thread.category,
          tags: thread.tags,
          message_count: thread.message_count,
        });

        // Simple hash function
        let hash = 0;
        for (let i = 0; i < contentForHash.length; i++) {
          const char = contentForHash.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        const currentHash = Math.abs(hash).toString(16);

        // Check if already synced and unchanged
        const existingState = syncStates[thread.id];
        if (existingState && existingState.content_hash === currentHash) {
          skipped++;
          continue;
        }

        // Generate markdown content
        const markdown = generateObsidianMarkdown(thread, config);

        // Generate file path
        const filePath = generateObsidianFilePath(thread, config);

        // Upload to Obsidian
        const encodedPath = encodeURIComponent(filePath);
        const putResponse = await fetch(`${endpoint}/vault/${encodedPath}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'text/markdown',
          },
          body: markdown,
        });

        if (putResponse.ok || putResponse.status === 204) {
          // Update sync state
          await updateObsidianSyncState(thread.id, {
            obsidian_path: filePath,
            content_hash: currentHash,
            synced_at: new Date().toISOString(),
            sync_status: 'synced',
            error: null,
          });
          synced++;
        } else {
          failed++;
          await updateObsidianSyncState(thread.id, {
            sync_status: 'error',
            error: `HTTP ${putResponse.status}`,
          });
        }
      } catch (err) {
        failed++;
        await updateObsidianSyncState(thread.id, {
          sync_status: 'error',
          error: err.message,
        });
      }
    }

    const result = {
      success: true,
      synced,
      skipped,
      failed,
      total: threads.length,
      vault: vaultName,
    };

    broadcastLog('success', `Obsidian sync complete: ${synced} synced, ${skipped} unchanged, ${failed} failed`, 'success');

    // Store last sync time
    await chrome.storage.local.set({
      obsidianLastSync: {
        time: new Date().toISOString(),
        ...result,
      },
    });

    return result;
  } catch (err) {
    broadcastLog('error', `Obsidian sync failed: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

/**
 * Generate Obsidian markdown with frontmatter
 */
function generateObsidianMarkdown(thread, config) {
  const now = new Date().toISOString();

  // Generate YAML frontmatter
  const frontmatter = [
    '---',
    `title: "${escapeYaml(thread.title || 'Untitled Thread')}"`,
    `provider: ${thread.provider}`,
    `provider_thread_id: ${thread.provider_thread_id}`,
    `status: ${thread.status || 'unknown'}`,
    `category: ${thread.category || 'other'}`,
    `priority: ${thread.priority || 'medium'}`,
    `tags: [${(thread.tags || []).map(t => escapeYaml(t)).join(', ')}]`,
    `created_at: ${thread.created_at || now}`,
    `synced_at: ${now}`,
    `source_url: ${thread.url || ''}`,
    `message_count: ${thread.message_count || 0}`,
    `contains_pii: ${Boolean(thread.contains_pii)}`,
    `contains_secrets: ${Boolean(thread.contains_security_or_secrets)}`,
    `thread_hub_id: ${thread.id}`,
    '---',
  ].join('\n');

  // Generate body
  const lines = [];
  lines.push(`# ${thread.title || 'Untitled Thread'}`);
  lines.push('');

  if (thread.ai_summary || thread.provider_summary) {
    lines.push('## Summary');
    lines.push(thread.ai_summary || thread.provider_summary);
    lines.push('');
  }

  if (thread.progress_stage || thread.outcome_prediction || thread.suggested_next_step) {
    lines.push('## Analysis');
    if (thread.progress_stage) lines.push(`- **Progress Stage:** ${thread.progress_stage}`);
    if (thread.outcome_prediction) lines.push(`- **Outcome Prediction:** ${thread.outcome_prediction}`);
    if (thread.suggested_next_step) lines.push(`- **Suggested Next Step:** ${thread.suggested_next_step}`);
    lines.push('');
  }

  const sensitivities = [];
  if (thread.contains_pii) sensitivities.push('PII');
  if (thread.contains_legal_sensitive) sensitivities.push('Legal');
  if (thread.contains_customer_sensitive) sensitivities.push('Customer Data');
  if (thread.contains_hr_sensitive) sensitivities.push('HR');
  if (thread.contains_security_or_secrets) sensitivities.push('Secrets/Credentials');

  if (sensitivities.length > 0) {
    lines.push('## Sensitivity');
    lines.push(`> [!warning] Contains: ${sensitivities.join(', ')}`);
    lines.push('');
  }

  lines.push('## Quick Stats');
  lines.push(`- **Provider:** ${thread.provider}`);
  lines.push(`- **Messages:** ${thread.message_count || 0}`);
  lines.push(`- **Created:** ${formatDateForObsidian(thread.created_at)}`);
  lines.push(`- **Status:** ${thread.status || 'unknown'}`);
  if (thread.tags && thread.tags.length > 0) {
    lines.push(`- **Tags:** ${thread.tags.join(', ')}`);
  }
  lines.push('');

  lines.push('---');
  lines.push(`*Synced from [AI Thread Hub](${thread.url || '#'})*`);

  return frontmatter + '\n\n' + lines.join('\n');
}

/**
 * Generate file path for Obsidian
 */
function generateObsidianFilePath(thread, config) {
  const targetFolder = config.targetFolder || 'AI Threads';
  const structure = config.folderStructure || 'by-provider';

  // Generate safe filename
  let name = (thread.title || 'untitled')
    .toLowerCase()
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  const shortId = thread.id.replace('thread-', '').slice(0, 8);
  const filename = `${name}-${shortId}.md`;

  let subFolder = '';
  switch (structure) {
    case 'by-provider':
      subFolder = thread.provider;
      break;
    case 'by-category':
      subFolder = thread.category || 'other';
      break;
    case 'by-date':
      const date = new Date(thread.created_at);
      subFolder = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
      break;
    case 'flat':
    default:
      subFolder = '';
  }

  const parts = [targetFolder, subFolder, filename].filter(Boolean);
  return parts.join('/');
}

/**
 * Escape string for YAML
 */
function escapeYaml(value) {
  if (typeof value !== 'string') return String(value);
  if (value.includes(':') || value.includes('#') || value.includes('\n') ||
      value.includes('"') || value.includes("'") || value.startsWith(' ') ||
      value.startsWith('-') || value.startsWith('[') || value.startsWith('{')) {
    return value.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
  return value;
}

/**
 * Format date for Obsidian display
 */
function formatDateForObsidian(isoDate) {
  if (!isoDate) return 'Unknown';
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

// Alarm listener for Obsidian and Claude Code sync
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === OBSIDIAN_ALARM_NAME) {
    broadcastLog('obsidian', 'Obsidian sync alarm triggered');
    await runObsidianSync();
  } else if (alarm.name === CLAUDE_CODE_ALARM_NAME) {
    broadcastLog('cli-sync', 'Claude Code sync alarm triggered');
    await runClaudeCodeSync();
  }
});

// Setup alarms on startup
chrome.runtime.onStartup.addListener(async () => {
  const obsidianConfig = await getObsidianConfigFromStorage();
  if (obsidianConfig.enabled && obsidianConfig.method === 'obsidian-rest-api') {
    await setupObsidianSyncAlarm(obsidianConfig);
  }

  const claudeCodeConfig = await getClaudeCodeConfigFromStorage();
  if (claudeCodeConfig.autoSyncEnabled) {
    await setupClaudeCodeSyncAlarm(claudeCodeConfig);
  }
});

// ============================================================
// Validation Audit
// ============================================================

/**
 * Start a validation audit to check message completeness
 * @param {Object} options - Audit options
 * @param {string[]} options.providers - Filter by providers (optional)
 * @param {number} options.limit - Max threads to validate (optional)
 * @param {number} options.delayMs - Delay between validations (default 60s)
 */
async function startValidationAudit(options = {}) {
  if (validationAuditRunning) {
    return { success: false, error: 'Validation audit already running' };
  }

  const { providers, limit, delayMs = DEFAULT_VALIDATION_DELAY_MS } = options;

  // Get threads to validate
  const threadsToValidate = await getThreadsForValidation({
    provider: providers?.length === 1 ? providers[0] : undefined,
    limit,
    includeValid: false, // Only validate unvalidated or suspicious
  });

  // Filter by multiple providers if specified
  let filtered = threadsToValidate;
  if (providers && providers.length > 0) {
    filtered = threadsToValidate.filter(t => providers.includes(t.provider));
  }

  if (filtered.length === 0) {
    return { success: true, message: 'No threads to validate', total: 0 };
  }

  broadcastLog('validation', `Starting validation audit for ${filtered.length} threads`);

  validationAuditRunning = true;
  validationAuditProgress = {
    current: 0,
    total: filtered.length,
    valid: 0,
    suspicious: 0,
    mismatch: 0,
  };

  // Run async (don't block response)
  runValidationLoop(filtered, delayMs).catch(err => {
    broadcastLog('error', `Validation audit failed: ${err.message}`, 'error');
    validationAuditRunning = false;
  });

  return {
    success: true,
    message: `Started validation audit for ${filtered.length} threads`,
    total: filtered.length,
  };
}

/**
 * Stop the running validation audit
 */
function stopValidationAudit() {
  if (validationAuditRunning) {
    broadcastLog('validation', 'Stopping validation audit...');
    validationAuditRunning = false;

    // Close tab if open
    if (validationAuditTabId) {
      chrome.tabs.remove(validationAuditTabId).catch(() => {});
      validationAuditTabId = null;
    }
  }
}

/**
 * Main validation loop
 */
async function runValidationLoop(threads, delayMs) {
  for (let i = 0; i < threads.length; i++) {
    if (!validationAuditRunning) {
      broadcastLog('validation', 'Validation audit stopped by user');
      break;
    }

    const thread = threads[i];
    validationAuditProgress.current = i + 1;

    try {
      broadcastLog('validation', `Validating ${i + 1}/${threads.length}: "${thread.title?.slice(0, 40)}..."`);

      // Get stored messages for comparison
      const storedMessages = await getMessagesByThreadId(thread.id);
      const storedCount = storedMessages.length;
      const storedFirstMessage = storedMessages[0]?.text?.slice(0, 100) || null;

      // Validate the thread by scraping
      const result = await validateSingleThread(thread);

      // Compare results
      const flags = [];
      let status = 'valid';

      if (result.error) {
        flags.push('scrape_failed');
        status = 'suspicious';
      } else {
        const newCount = result.messageCount || 0;

        if (newCount === 0) {
          flags.push('scrape_failed');
          status = 'suspicious';
        } else if (newCount < storedCount) {
          flags.push('count_decreased');
          status = 'mismatch';
        } else if (newCount > storedCount * 1.2) {
          flags.push('count_increased');
          status = 'suspicious'; // Thread grew significantly - may need re-sync
        }

        // Check first message content
        if (result.firstMessage && storedFirstMessage) {
          const similarity = stringSimilarity(result.firstMessage, storedFirstMessage);
          if (similarity < 0.8) {
            flags.push('content_changed');
            if (status === 'valid') status = 'suspicious';
          }
        }
      }

      // If suspicious, retry once
      if (status === 'suspicious' && !result.isRetry) {
        broadcastLog('validation', `Retrying validation for "${thread.title?.slice(0, 30)}..."`);
        await sleep(5000);
        const retryResult = await validateSingleThread(thread, true);

        // Re-evaluate with retry result
        const newFlags = [];
        if (retryResult.error || retryResult.messageCount === 0) {
          newFlags.push('scrape_failed');
        } else {
          const newCount = retryResult.messageCount;
          if (newCount < storedCount) {
            newFlags.push('count_decreased');
            status = 'mismatch';
          } else if (newCount === storedCount || Math.abs(newCount - storedCount) <= 1) {
            status = 'valid';
          }
        }

        if (newFlags.length > 0) {
          flags.push(...newFlags.filter(f => !flags.includes(f)));
        }
      }

      // Update thread validation status
      await updateThreadValidation(thread.id, {
        status,
        flags,
        message_count: result.messageCount || null,
        first_message: result.firstMessage || null,
      });

      // Update progress
      if (status === 'valid') validationAuditProgress.valid++;
      else if (status === 'suspicious') validationAuditProgress.suspicious++;
      else if (status === 'mismatch') validationAuditProgress.mismatch++;

      // Broadcast progress
      chrome.runtime.sendMessage({
        type: 'VALIDATION_PROGRESS',
        progress: validationAuditProgress,
        thread: { id: thread.id, title: thread.title, status },
      }).catch(() => {});

    } catch (err) {
      broadcastLog('error', `Validation error for "${thread.title?.slice(0, 30)}": ${err.message}`, 'error');
    }

    // Delay before next thread
    if (i < threads.length - 1 && validationAuditRunning) {
      await sleep(delayMs);
    }
  }

  validationAuditRunning = false;

  // Close tab
  if (validationAuditTabId) {
    chrome.tabs.remove(validationAuditTabId).catch(() => {});
    validationAuditTabId = null;
  }

  broadcastLog('success', `Validation audit complete: ${validationAuditProgress.valid} valid, ${validationAuditProgress.suspicious} suspicious, ${validationAuditProgress.mismatch} mismatches`, 'success');
}

/**
 * Validate a single thread by scraping
 */
async function validateSingleThread(thread, isRetry = false) {
  const timeout = isRetry ? 45000 : 30000; // Longer timeout for retry
  const extraWait = isRetry ? 8000 : 5000; // More wait time for retry

  try {
    // Open thread URL in background tab
    const tab = await chrome.tabs.create({
      url: thread.url,
      active: false,
    });
    validationAuditTabId = tab.id;

    // Wait for tab to load
    await waitForTabLoad(tab.id, timeout);
    await sleep(extraWait); // Extra wait for JS to render

    // Scrape the thread
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_THREAD' });

    // Close tab
    await chrome.tabs.remove(tab.id).catch(() => {});
    validationAuditTabId = null;

    if (!response?.success) {
      return { error: response?.error || 'Scrape failed', isRetry };
    }

    const messages = response.messages || [];
    return {
      messageCount: messages.length,
      firstMessage: messages[0]?.text?.slice(0, 100) || null,
      lastMessage: messages[messages.length - 1]?.text?.slice(0, 100) || null,
      isRetry,
    };

  } catch (err) {
    // Clean up tab on error
    if (validationAuditTabId) {
      await chrome.tabs.remove(validationAuditTabId).catch(() => {});
      validationAuditTabId = null;
    }
    return { error: err.message, isRetry };
  }
}

/**
 * Simple string similarity check (Jaccard-ish)
 */
function stringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;

  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}
