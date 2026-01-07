/**
 * Obsidian Local REST API Client
 *
 * Communicates with the Obsidian Local REST API plugin
 * https://github.com/coddingtonbear/obsidian-local-rest-api
 */

class ObsidianAPIClient {
  /**
   * Create a new Obsidian API client
   * @param {string} endpoint - API endpoint (e.g., 'https://127.0.0.1:27124')
   * @param {string} apiKey - API key for authentication
   */
  constructor(endpoint, apiKey) {
    // Ensure endpoint doesn't have trailing slash
    this.endpoint = endpoint.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  /**
   * Make an authenticated request to the Obsidian API
   * @param {string} path - API path
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async _request(path, options = {}) {
    const url = `${this.endpoint}${path}`;

    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });
      return response;
    } catch (error) {
      // Connection refused or network error
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new ObsidianConnectionError('Cannot connect to Obsidian. Is Obsidian running with the Local REST API plugin enabled?');
      }
      throw error;
    }
  }

  /**
   * Test connection to Obsidian
   * @returns {Promise<{connected: boolean, vaultName?: string, error?: string}>}
   */
  async testConnection() {
    try {
      const response = await this._request('/');

      if (response.ok) {
        const data = await response.json();
        return {
          connected: true,
          vaultName: data.name || data.vault || 'Unknown',
          authenticated: data.authenticated !== false,
        };
      }

      if (response.status === 401) {
        return {
          connected: true,
          authenticated: false,
          error: 'Invalid API key',
        };
      }

      return {
        connected: false,
        error: `Server responded with status ${response.status}`,
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
      };
    }
  }

  /**
   * Get a note from the vault
   * @param {string} path - Path to the note (e.g., 'AI Threads/thread-123.md')
   * @returns {Promise<{exists: boolean, content?: string, error?: string}>}
   */
  async getNote(path) {
    try {
      const encodedPath = encodeURIComponent(path);
      const response = await this._request(`/vault/${encodedPath}`, {
        method: 'GET',
        headers: {
          'Accept': 'text/markdown',
        },
      });

      if (response.ok) {
        const content = await response.text();
        return { exists: true, content };
      }

      if (response.status === 404) {
        return { exists: false };
      }

      return { exists: false, error: `Failed to get note: ${response.status}` };
    } catch (error) {
      return { exists: false, error: error.message };
    }
  }

  /**
   * Create or update a note in the vault
   * @param {string} path - Path to the note
   * @param {string} content - Markdown content
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async putNote(path, content) {
    try {
      const encodedPath = encodeURIComponent(path);
      const response = await this._request(`/vault/${encodedPath}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/markdown',
        },
        body: content,
      });

      if (response.ok || response.status === 204) {
        return { success: true };
      }

      const errorText = await response.text().catch(() => '');
      return {
        success: false,
        error: `Failed to save note: ${response.status} ${errorText}`.trim(),
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a note from the vault
   * @param {string} path - Path to the note
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteNote(path) {
    try {
      const encodedPath = encodeURIComponent(path);
      const response = await this._request(`/vault/${encodedPath}`, {
        method: 'DELETE',
      });

      if (response.ok || response.status === 204 || response.status === 404) {
        return { success: true };
      }

      return {
        success: false,
        error: `Failed to delete note: ${response.status}`,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * List files in a directory
   * @param {string} path - Directory path
   * @returns {Promise<{files?: string[], error?: string}>}
   */
  async listDirectory(path = '') {
    try {
      const encodedPath = path ? encodeURIComponent(path) + '/' : '';
      const response = await this._request(`/vault/${encodedPath}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        return { files: data.files || [] };
      }

      if (response.status === 404) {
        return { files: [] };
      }

      return { error: `Failed to list directory: ${response.status}` };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Search notes in the vault
   * @param {string} query - Search query
   * @returns {Promise<{results?: Array, error?: string}>}
   */
  async searchNotes(query) {
    try {
      const response = await this._request('/search/simple/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (response.ok) {
        const data = await response.json();
        return { results: data };
      }

      return { error: `Search failed: ${response.status}` };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Create a directory (by creating a placeholder file)
   * @param {string} path - Directory path
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async ensureDirectory(path) {
    // The REST API creates directories automatically when putting files
    // So we just need to verify the path is valid
    return { success: true };
  }
}

/**
 * Custom error for connection issues
 */
class ObsidianConnectionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ObsidianConnectionError';
  }
}

// Export for use in extension
if (typeof window !== 'undefined') {
  window.ObsidianAPIClient = ObsidianAPIClient;
  window.ObsidianConnectionError = ObsidianConnectionError;
}

if (typeof module !== 'undefined') {
  module.exports = { ObsidianAPIClient, ObsidianConnectionError };
}
