/**
 * Obsidian Sync Orchestration Module
 *
 * Manages the sync process between AI Thread Hub and Obsidian vault.
 * Handles batch syncing, change detection, and progress tracking.
 */

/**
 * Obsidian Sync Manager
 * Coordinates the sync process between Thread Hub and Obsidian
 */
class ObsidianSyncManager {
  constructor(apiClient, storageModule) {
    this.api = apiClient;
    this.storage = storageModule;
    this.isRunning = false;
    this.lastSyncTime = null;
    this.syncStats = {
      synced: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };
  }

  /**
   * Run a full sync of all threads
   * @param {Object} config - Sync configuration
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Sync results
   */
  async runFullSync(config, onProgress = () => {}) {
    if (this.isRunning) {
      return { success: false, error: 'Sync already in progress' };
    }

    this.isRunning = true;
    this.syncStats = { synced: 0, skipped: 0, failed: 0, errors: [] };
    const startTime = Date.now();

    try {
      // Test connection first
      const connectionTest = await this.api.testConnection();
      if (!connectionTest.connected) {
        throw new Error(`Cannot connect to Obsidian: ${connectionTest.error}`);
      }

      onProgress({ phase: 'connected', vault: connectionTest.vaultName });

      // Get all threads
      const threads = await this._getAllThreads();
      const totalThreads = threads.length;

      onProgress({ phase: 'loaded', total: totalThreads });

      // Get existing sync states
      const syncStates = await this._getSyncStates();

      // Process each thread
      for (let i = 0; i < threads.length; i++) {
        const thread = threads[i];
        const progress = Math.round(((i + 1) / totalThreads) * 100);

        onProgress({
          phase: 'syncing',
          current: i + 1,
          total: totalThreads,
          progress,
          threadTitle: thread.title,
        });

        try {
          const result = await this._syncThread(thread, syncStates[thread.id], config);

          if (result.synced) {
            this.syncStats.synced++;
          } else if (result.skipped) {
            this.syncStats.skipped++;
          }
        } catch (error) {
          this.syncStats.failed++;
          this.syncStats.errors.push({
            threadId: thread.id,
            title: thread.title,
            error: error.message,
          });
        }
      }

      this.lastSyncTime = new Date();
      const duration = Date.now() - startTime;

      onProgress({ phase: 'complete' });

      return {
        success: true,
        duration,
        ...this.syncStats,
        lastSync: this.lastSyncTime.toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        ...this.syncStats,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Sync a single thread
   * @param {Object} thread - Thread to sync
   * @param {Object} existingState - Existing sync state (or undefined)
   * @param {Object} config - Sync configuration
   * @returns {Promise<Object>} Sync result
   */
  async _syncThread(thread, existingState, config) {
    // Compute current content hash
    const currentHash = await window.ObsidianExport.computeContentHash(thread);

    // Check if we can skip (unchanged)
    if (existingState && existingState.content_hash === currentHash) {
      return { skipped: true, reason: 'unchanged' };
    }

    // Get messages if needed
    let messages = [];
    if (config.includeMessages === 'full') {
      messages = await this._getThreadMessages(thread.id);
    }

    // Generate markdown
    const markdown = window.ObsidianExport.generateObsidianMarkdown(thread, {
      includeMessages: config.includeMessages,
      messages,
      syncedAt: new Date(),
    });

    // Generate file path
    const filePath = window.ObsidianExport.generateFilePath(thread, config);

    // Upload to Obsidian
    const putResult = await this.api.putNote(filePath, markdown);

    if (!putResult.success) {
      throw new Error(putResult.error || 'Failed to save note');
    }

    // Update sync state
    await this._updateSyncState(thread.id, {
      obsidian_path: filePath,
      content_hash: currentHash,
      synced_at: new Date().toISOString(),
      sync_status: 'synced',
      error: null,
    });

    return { synced: true, path: filePath };
  }

  /**
   * Sync a single thread by ID (for manual sync button)
   * @param {string} threadId - Thread ID
   * @param {Object} config - Sync configuration
   * @returns {Promise<Object>} Sync result
   */
  async syncSingleThread(threadId, config) {
    try {
      const connectionTest = await this.api.testConnection();
      if (!connectionTest.connected) {
        throw new Error(`Cannot connect to Obsidian: ${connectionTest.error}`);
      }

      const thread = await this._getThread(threadId);
      if (!thread) {
        throw new Error('Thread not found');
      }

      const existingState = await this._getSyncState(threadId);
      const result = await this._syncThread(thread, existingState, config);

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Export threads as downloadable markdown files (fallback mode)
   * @param {Array} threadIds - Thread IDs to export (or null for all)
   * @param {Object} config - Export configuration
   * @returns {Promise<Array>} Array of {filename, content} objects
   */
  async exportForDownload(threadIds, config) {
    let threads;
    if (threadIds && threadIds.length > 0) {
      threads = await Promise.all(threadIds.map(id => this._getThread(id)));
      threads = threads.filter(Boolean);
    } else {
      threads = await this._getAllThreads();
    }

    const exports = [];

    for (const thread of threads) {
      let messages = [];
      if (config.includeMessages === 'full') {
        messages = await this._getThreadMessages(thread.id);
      }

      const markdown = window.ObsidianExport.generateObsidianMarkdown(thread, {
        includeMessages: config.includeMessages,
        messages,
        syncedAt: new Date(),
      });

      const filePath = window.ObsidianExport.generateFilePath(thread, config);

      exports.push({
        filename: filePath.split('/').pop(), // Just the filename
        fullPath: filePath,
        content: markdown,
        threadId: thread.id,
      });
    }

    return exports;
  }

  /**
   * Download a single markdown file
   * @param {string} filename
   * @param {string} content
   */
  downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    // Use Chrome downloads API if available
    if (typeof chrome !== 'undefined' && chrome.downloads) {
      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true,
      });
    } else {
      // Fallback for non-extension context
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Download multiple markdown files as a zip (requires JSZip)
   * @param {Array} files - Array of {filename, content}
   */
  async downloadAsZip(files) {
    // For simplicity, download individually if no zip library
    // In production, would use JSZip
    for (const file of files) {
      this.downloadFile(file.filename, file.content);
      // Small delay between downloads
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // ============ Storage Helpers ============
  // These would typically call chrome.runtime.sendMessage to interact with background.js

  async _getAllThreads() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'LIST_THREADS', payload: {} }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.threads || []);
        }
      });
    });
  }

  async _getThread(threadId) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_THREAD', payload: { threadId } }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.thread);
        }
      });
    });
  }

  async _getThreadMessages(threadId) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_THREAD_MESSAGES', payload: { threadId } }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.messages || []);
        }
      });
    });
  }

  async _getSyncStates() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_OBSIDIAN_SYNC_STATES' }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response.states || {});
        }
      });
    });
  }

  async _getSyncState(threadId) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_OBSIDIAN_SYNC_STATE', payload: { threadId } }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response.state);
        }
      });
    });
  }

  async _updateSyncState(threadId, state) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'UPDATE_OBSIDIAN_SYNC_STATE',
        payload: { threadId, state }
      }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
}

/**
 * Get Obsidian config from storage
 * @returns {Promise<Object>}
 */
async function getObsidianConfig() {
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
 * Save Obsidian config to storage
 * @param {Object} config
 * @returns {Promise<void>}
 */
async function saveObsidianConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ obsidian: config }, resolve);
  });
}

/**
 * Create a configured sync manager
 * @returns {Promise<ObsidianSyncManager>}
 */
async function createSyncManager() {
  const config = await getObsidianConfig();
  const apiClient = new window.ObsidianAPIClient(config.apiEndpoint, config.apiKey);
  return new ObsidianSyncManager(apiClient);
}

// Export for use in extension
if (typeof window !== 'undefined') {
  window.ObsidianSync = {
    ObsidianSyncManager,
    getObsidianConfig,
    saveObsidianConfig,
    createSyncManager,
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    ObsidianSyncManager,
    getObsidianConfig,
    saveObsidianConfig,
    createSyncManager,
  };
}
