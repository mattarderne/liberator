/**
 * Auto-Sync Module
 *
 * Triggers sync when tab becomes hidden (user switches away).
 * Debounced to avoid excessive syncing.
 */

(function() {
  'use strict';

  const SYNC_DEBOUNCE_MS = 30000; // 30 seconds minimum between syncs
  const SYNC_DELAY_MS = 2000; // Wait 2s after tab hidden before syncing

  let lastSyncTime = 0;
  let pendingSyncTimeout = null;
  let isInitialized = false;

  /**
   * Request a sync from the background script
   */
  async function requestSync() {
    const now = Date.now();

    // Debounce check
    if (now - lastSyncTime < SYNC_DEBOUNCE_MS) {
      if (typeof extLog === 'function') {
        extLog('content', 'info', 'Auto-sync skipped (debounce)');
      }
      return;
    }

    lastSyncTime = now;

    try {
      // Send sync request for this tab only
      const response = await chrome.runtime.sendMessage({
        type: 'AUTO_SYNC_TAB',
        url: window.location.href
      });

      if (typeof extLog === 'function') {
        extLog('content', 'info', 'Auto-sync completed', response);
      }
    } catch (err) {
      if (typeof extLog === 'function') {
        extLog('content', 'error', 'Auto-sync failed', err?.message);
      }
    }
  }

  /**
   * Handle visibility change
   */
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      // Tab became hidden - schedule sync after short delay
      // (in case user is just quickly switching tabs)
      if (pendingSyncTimeout) {
        clearTimeout(pendingSyncTimeout);
      }

      pendingSyncTimeout = setTimeout(() => {
        if (document.visibilityState === 'hidden') {
          requestSync();
        }
        pendingSyncTimeout = null;
      }, SYNC_DELAY_MS);

      if (typeof extLog === 'function') {
        extLog('content', 'info', 'Tab hidden - sync scheduled');
      }
    } else {
      // Tab became visible - cancel pending sync
      if (pendingSyncTimeout) {
        clearTimeout(pendingSyncTimeout);
        pendingSyncTimeout = null;

        if (typeof extLog === 'function') {
          extLog('content', 'info', 'Tab visible - sync cancelled');
        }
      }
    }
  }

  /**
   * Initialize auto-sync
   */
  function initAutoSync() {
    if (isInitialized) return;
    isInitialized = true;

    document.addEventListener('visibilitychange', onVisibilityChange);

    if (typeof extLog === 'function') {
      extLog('content', 'info', 'Auto-sync initialized');
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoSync);
  } else {
    initAutoSync();
  }

  // Expose for manual triggering if needed
  if (typeof window !== 'undefined') {
    window.__threadhub_requestSync = requestSync;
  }

})();
