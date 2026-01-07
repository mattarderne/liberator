/**
 * Chrome Extension - Shared Debug Logger
 *
 * Captures console logs from all extension scripts (content, background, popup)
 * and stores them in chrome.storage.local for retrieval during automated testing.
 *
 * Usage:
 *   extLog('content', 'log', 'Message here', someData);
 *   extLog('background', 'error', 'Something went wrong', error);
 *   extLog('popup', 'info', 'Notes loaded:', count);
 *
 * Log Levels (from least to most verbose):
 *   extSetLogLevel('error') - Only errors
 *   extSetLogLevel('warn')  - Errors and warnings
 *   extSetLogLevel('info')  - Default: errors, warnings, info
 *   extSetLogLevel('log')   - Everything including debug logs
 *
 * Filtering logs:
 *   extFilterLogs({ level: 'error', source: 'background', since: Date.now() - 60000 })
 *
 * IMPORTANT: Customize LOG_KEY to be unique to your extension to avoid conflicts.
 */

(function() {
  'use strict';

  // CUSTOMIZE: Change this key to be unique to your extension
  const LOG_KEY = '__threadhub_debug_logs__';
  const LOG_LEVEL_KEY = '__threadhub_log_level__';
  const MAX_LOGS = 1000;

  // Log levels with numeric priorities (higher = more verbose)
  const LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    log: 3,
  };

  // Current log level - defaults to 'info', can be changed at runtime
  let currentLogLevel = 'info';

  // Queue for batching writes to storage
  let logQueue = [];
  let flushTimeout = null;
  let isFlushing = false;

  // Load saved log level from storage
  (async function loadLogLevel() {
    try {
      const result = await chrome.storage.local.get(LOG_LEVEL_KEY);
      if (result[LOG_LEVEL_KEY] && LOG_LEVELS[result[LOG_LEVEL_KEY]] !== undefined) {
        currentLogLevel = result[LOG_LEVEL_KEY];
      }
    } catch (e) {
      // Ignore - use default
    }
  })();

  /**
   * Set the minimum log level to store
   * @param {'error' | 'warn' | 'info' | 'log'} level
   */
  async function extSetLogLevel(level) {
    if (LOG_LEVELS[level] === undefined) {
      console.warn(`[THREADHUB:logger] Invalid log level: ${level}. Use: error, warn, info, log`);
      return;
    }
    currentLogLevel = level;
    try {
      await chrome.storage.local.set({ [LOG_LEVEL_KEY]: level });
    } catch (e) {
      // Ignore storage errors
    }
    console.log(`[THREADHUB:logger] Log level set to: ${level}`);
  }

  /**
   * Get the current log level
   * @returns {string}
   */
  function extGetLogLevel() {
    return currentLogLevel;
  }

  /**
   * Check if a log level should be stored based on current setting
   */
  function shouldLog(level) {
    const levelPriority = LOG_LEVELS[level] ?? LOG_LEVELS.log;
    const currentPriority = LOG_LEVELS[currentLogLevel] ?? LOG_LEVELS.info;
    return levelPriority <= currentPriority;
  }

  /**
   * Log a message to both console and chrome.storage
   * @param {string} source - 'content' | 'background' | 'popup'
   * @param {string} level - 'log' | 'error' | 'warn' | 'info'
   * @param {...any} args - Arguments to log
   */
  function extLog(source, level, ...args) {
    // Always log to console immediately (for manual debugging)
    const consoleFn = console[level] || console.log;
    consoleFn.apply(console, [`[THREADHUB:${source}]`, ...args]);

    // Check if we should store this log based on current log level
    if (!shouldLog(level)) {
      return;
    }

    // Format arguments for storage
    const message = args.map(arg => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    // Queue the log entry
    logQueue.push({
      t: Date.now(),
      s: source,
      l: level,
      m: message
    });

    // Debounce flush to batch writes (100ms)
    if (!flushTimeout) {
      flushTimeout = setTimeout(flushLogs, 100);
    }
  }

  /**
   * Flush queued logs to chrome.storage.local
   */
  async function flushLogs() {
    flushTimeout = null;

    if (logQueue.length === 0 || isFlushing) return;

    isFlushing = true;
    const toFlush = logQueue;
    logQueue = [];

    try {
      const result = await chrome.storage.local.get(LOG_KEY);
      const existing = result[LOG_KEY] || [];
      const combined = [...existing, ...toFlush];

      // Keep only last MAX_LOGS entries to prevent bloat
      const trimmed = combined.length > MAX_LOGS
        ? combined.slice(-MAX_LOGS)
        : combined;

      await chrome.storage.local.set({ [LOG_KEY]: trimmed });
    } catch (e) {
      // If storage fails, at least we logged to console
      console.error('[THREADHUB:logger] Failed to flush logs to storage:', e);
    } finally {
      isFlushing = false;

      // If more logs queued during flush, schedule another flush
      if (logQueue.length > 0 && !flushTimeout) {
        flushTimeout = setTimeout(flushLogs, 100);
      }
    }
  }

  /**
   * Get all stored logs
   * @returns {Promise<Array>} Array of log entries
   */
  async function extGetLogs() {
    // Flush any pending logs first
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }
    if (logQueue.length > 0) {
      await flushLogs();
    }

    try {
      const result = await chrome.storage.local.get(LOG_KEY);
      return result[LOG_KEY] || [];
    } catch (e) {
      console.error('[THREADHUB:logger] Failed to get logs:', e);
      return [];
    }
  }

  /**
   * Clear all stored logs
   */
  async function extClearLogs() {
    logQueue = [];
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }

    try {
      await chrome.storage.local.remove(LOG_KEY);
    } catch (e) {
      console.error('[THREADHUB:logger] Failed to clear logs:', e);
    }
  }

  /**
   * Filter logs by various criteria
   * @param {Object} options - Filter options
   * @param {string} options.level - Filter by log level ('error', 'warn', 'info', 'log')
   * @param {string} options.source - Filter by source ('content', 'background', 'popup')
   * @param {number} options.since - Only logs after this timestamp (ms)
   * @param {number} options.until - Only logs before this timestamp (ms)
   * @param {string} options.search - Search string to match in message
   * @param {RegExp} options.pattern - Regex pattern to match in message
   * @param {number} options.limit - Maximum number of logs to return
   * @returns {Promise<Array>} Filtered log entries
   */
  async function extFilterLogs(options = {}) {
    const logs = await extGetLogs();
    const {
      level,
      source,
      since,
      until,
      search,
      pattern,
      limit,
    } = options;

    let filtered = logs;

    if (level) {
      filtered = filtered.filter(log => log.l === level);
    }

    if (source) {
      filtered = filtered.filter(log => log.s === source);
    }

    if (since) {
      filtered = filtered.filter(log => log.t >= since);
    }

    if (until) {
      filtered = filtered.filter(log => log.t <= until);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(log => log.m.toLowerCase().includes(searchLower));
    }

    if (pattern && pattern instanceof RegExp) {
      filtered = filtered.filter(log => pattern.test(log.m));
    }

    if (limit && limit > 0) {
      filtered = filtered.slice(-limit);
    }

    return filtered;
  }

  /**
   * Get log statistics
   * @returns {Promise<Object>} Log statistics
   */
  async function extGetLogStats() {
    const logs = await extGetLogs();

    const stats = {
      total: logs.length,
      byLevel: { error: 0, warn: 0, info: 0, log: 0 },
      bySource: {},
      oldest: null,
      newest: null,
      errorsLast5Min: 0,
    };

    const fiveMinAgo = Date.now() - 5 * 60 * 1000;

    for (const log of logs) {
      // Count by level
      if (stats.byLevel[log.l] !== undefined) {
        stats.byLevel[log.l]++;
      }

      // Count by source
      stats.bySource[log.s] = (stats.bySource[log.s] || 0) + 1;

      // Track timestamps
      if (!stats.oldest || log.t < stats.oldest) {
        stats.oldest = log.t;
      }
      if (!stats.newest || log.t > stats.newest) {
        stats.newest = log.t;
      }

      // Count recent errors
      if (log.l === 'error' && log.t >= fiveMinAgo) {
        stats.errorsLast5Min++;
      }
    }

    // Add human-readable time range
    if (stats.oldest && stats.newest) {
      const durationMs = stats.newest - stats.oldest;
      const durationMin = Math.round(durationMs / 60000);
      stats.timeRangeMinutes = durationMin;
    }

    return stats;
  }

  /**
   * Format logs for display (useful for debugging)
   * @param {Array} logs - Array of log entries
   * @returns {string} Formatted log string
   */
  function extFormatLogs(logs) {
    return logs.map(log => {
      const time = new Date(log.t).toISOString().slice(11, 23);
      const level = log.l.toUpperCase().padEnd(5);
      const source = log.s.padEnd(10);
      return `[${time}] ${level} ${source} ${log.m}`;
    }).join('\n');
  }

  // ============================================================
  // Event-based API for test retrieval
  // (Content scripts run in isolated world, so we use events
  // to communicate with the main world where Playwright runs)
  // ============================================================

  // CUSTOMIZE: Change event names to be unique to your extension
  const GET_LOGS_EVENT = '__threadhub_get_logs__';
  const LOGS_RESPONSE_EVENT = '__threadhub_logs_response__';
  const CLEAR_LOGS_EVENT = '__threadhub_clear_logs__';
  const CLEAR_DONE_EVENT = '__threadhub_clear_logs_done__';

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Content script context - set up event listeners for test communication

    window.addEventListener(GET_LOGS_EVENT, async () => {
      const logs = await extGetLogs();
      window.dispatchEvent(new CustomEvent(LOGS_RESPONSE_EVENT, {
        detail: JSON.stringify(logs) // Stringify to safely pass through
      }));
    });

    window.addEventListener(CLEAR_LOGS_EVENT, async () => {
      await extClearLogs();
      window.dispatchEvent(new Event(CLEAR_DONE_EVENT));
    });
  }

  // ============================================================
  // Expose globally
  // ============================================================

  // For content scripts and popup (window context)
  if (typeof window !== 'undefined') {
    window.extLog = extLog;
    window.extGetLogs = extGetLogs;
    window.extClearLogs = extClearLogs;
    window.extFilterLogs = extFilterLogs;
    window.extGetLogStats = extGetLogStats;
    window.extFormatLogs = extFormatLogs;
    window.extSetLogLevel = extSetLogLevel;
    window.extGetLogLevel = extGetLogLevel;
  }

  // For service worker (self context)
  if (typeof self !== 'undefined' && typeof window === 'undefined') {
    self.extLog = extLog;
    self.extGetLogs = extGetLogs;
    self.extClearLogs = extClearLogs;
    self.extFilterLogs = extFilterLogs;
    self.extGetLogStats = extGetLogStats;
    self.extFormatLogs = extFormatLogs;
    self.extSetLogLevel = extSetLogLevel;
    self.extGetLogLevel = extGetLogLevel;
  }

  // Also expose on globalThis for universal access
  if (typeof globalThis !== 'undefined') {
    globalThis.extLog = extLog;
    globalThis.extGetLogs = extGetLogs;
    globalThis.extClearLogs = extClearLogs;
    globalThis.extFilterLogs = extFilterLogs;
    globalThis.extGetLogStats = extGetLogStats;
    globalThis.extFormatLogs = extFormatLogs;
    globalThis.extSetLogLevel = extSetLogLevel;
    globalThis.extGetLogLevel = extGetLogLevel;
  }

})();
