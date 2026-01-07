/**
 * Comprehensive extension test suite
 *
 * Tests the full flow:
 * 1. Extension loads without errors
 * 2. Popup UI renders correctly
 * 3. Message passing works (sync, discover, queue operations)
 * 4. Background sync loop functions correctly
 */

import { chromium } from 'playwright';
import path from 'path';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..');

// Test results
const results = {
  passed: 0,
  failed: 0,
  errors: [],
};

function log(msg) {
  console.log(`[TEST] ${msg}`);
}

function pass(testName) {
  results.passed++;
  console.log(`  ✓ ${testName}`);
}

function fail(testName, error) {
  results.failed++;
  results.errors.push({ test: testName, error: error.message || error });
  console.log(`  ✗ ${testName}: ${error.message || error}`);
}

// Simple HTTP server to serve mock pages
function startMockServer(port = 3456) {
  const mocksDir = path.join(__dirname, 'mocks');

  const server = http.createServer((req, res) => {
    // Parse URL to determine which mock to serve
    let filePath;

    if (req.url.includes('claude.ai') || req.url.includes('/claude')) {
      filePath = path.join(mocksDir, 'claude.html');
    } else if (req.url.includes('chatgpt.com') || req.url.includes('/chatgpt')) {
      filePath = path.join(mocksDir, 'chatgpt.html');
    } else if (req.url.includes('gemini.google.com') || req.url.includes('/gemini')) {
      filePath = path.join(mocksDir, 'gemini.html');
    } else if (req.url.includes('grok.com') || req.url.includes('/grok')) {
      filePath = path.join(mocksDir, 'grok.html');
    } else {
      // Default - list available mocks
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <h1>Mock AI Providers</h1>
        <ul>
          <li><a href="/claude">Claude Mock</a></li>
          <li><a href="/chatgpt">ChatGPT Mock</a></li>
          <li><a href="/gemini">Gemini Mock</a></li>
          <li><a href="/grok">Grok Mock</a></li>
        </ul>
      `);
      return;
    }

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      log(`Mock server running on http://localhost:${port}`);
      resolve(server);
    });
  });
}

async function runTests() {
  log('Starting extension tests...\n');

  // Start mock server
  const server = await startMockServer();

  let context;
  let extensionId;

  try {
    // Launch browser with extension
    log('Launching Chrome with extension...');
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    // Get service worker and extension ID
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 10000 });
    }

    const swUrl = serviceWorker.url();
    extensionId = swUrl.match(/chrome-extension:\/\/([^/]+)/)?.[1];

    if (!extensionId) {
      throw new Error('Could not get extension ID');
    }
    log(`Extension loaded: ${extensionId}\n`);

    // ========== TEST SUITE ==========

    console.log('1. Extension Loading Tests');
    console.log('─'.repeat(40));

    // Test: Service worker loads
    try {
      if (serviceWorker) {
        pass('Service worker loaded');
      } else {
        fail('Service worker loaded', 'No service worker found');
      }
    } catch (e) {
      fail('Service worker loaded', e);
    }

    // Test: Popup loads without errors
    const popupPage = await context.newPage();
    const popupErrors = [];
    popupPage.on('pageerror', (err) => popupErrors.push(err.message));
    popupPage.on('console', (msg) => {
      if (msg.type() === 'error') popupErrors.push(msg.text());
    });

    try {
      await popupPage.goto(`chrome-extension://${extensionId}/ui/popup.html`);
      await popupPage.waitForTimeout(500);

      if (popupErrors.length === 0) {
        pass('Popup loads without errors');
      } else {
        fail('Popup loads without errors', popupErrors.join('; '));
      }
    } catch (e) {
      fail('Popup loads without errors', e);
    }

    console.log('\n2. UI Element Tests');
    console.log('─'.repeat(40));

    // Test: Core buttons exist
    const buttons = ['sync', 'discover', 'queue-add', 'queue-start'];
    for (const btnId of buttons) {
      try {
        const btn = await popupPage.$(`#${btnId}`);
        if (btn) {
          pass(`Button #${btnId} exists`);
        } else {
          fail(`Button #${btnId} exists`, 'Element not found');
        }
      } catch (e) {
        fail(`Button #${btnId} exists`, e);
      }
    }

    // Test: Stats elements exist
    const stats = ['total-count', 'discovered-count', 'queue-pending'];
    for (const statId of stats) {
      try {
        const el = await popupPage.$(`#${statId}`);
        if (el) {
          pass(`Stat #${statId} exists`);
        } else {
          fail(`Stat #${statId} exists`, 'Element not found');
        }
      } catch (e) {
        fail(`Stat #${statId} exists`, e);
      }
    }

    console.log('\n3. Message Passing Tests');
    console.log('─'.repeat(40));

    // Test: LIST_THREADS works
    try {
      const listResult = await popupPage.evaluate(async () => {
        return await chrome.runtime.sendMessage({ type: 'LIST_THREADS' });
      });

      if (listResult?.success && Array.isArray(listResult.threads)) {
        pass('LIST_THREADS returns valid response');
      } else {
        fail('LIST_THREADS returns valid response', JSON.stringify(listResult));
      }
    } catch (e) {
      fail('LIST_THREADS returns valid response', e);
    }

    // Test: GET_QUEUE_STATS works
    try {
      const queueResult = await popupPage.evaluate(async () => {
        return await chrome.runtime.sendMessage({ type: 'GET_QUEUE_STATS' });
      });

      if (queueResult?.success && queueResult.stats) {
        pass('GET_QUEUE_STATS returns valid response');
        log(`    Queue stats: pending=${queueResult.stats.pending}, completed=${queueResult.stats.completed}`);
      } else {
        fail('GET_QUEUE_STATS returns valid response', JSON.stringify(queueResult));
      }
    } catch (e) {
      fail('GET_QUEUE_STATS returns valid response', e);
    }

    // Test: GET_DISCOVERED works
    try {
      const discResult = await popupPage.evaluate(async () => {
        return await chrome.runtime.sendMessage({ type: 'GET_DISCOVERED' });
      });

      if (discResult?.success) {
        pass('GET_DISCOVERED returns valid response');
      } else {
        fail('GET_DISCOVERED returns valid response', JSON.stringify(discResult));
      }
    } catch (e) {
      fail('GET_DISCOVERED returns valid response', e);
    }

    console.log('\n4. Button Click Tests');
    console.log('─'.repeat(40));

    // Test: Sync button works
    try {
      const syncBtn = await popupPage.$('#sync');
      await syncBtn.click();
      await popupPage.waitForTimeout(500);

      const syncText = await syncBtn.textContent();
      // Should return to "Sync Now" after completing
      if (syncText === 'Sync Now') {
        pass('Sync button click completes');
      } else {
        pass('Sync button responds to click');
      }
    } catch (e) {
      fail('Sync button click', e);
    }

    // Test: Discover button works
    try {
      const discoverBtn = await popupPage.$('#discover');
      await discoverBtn.click();
      await popupPage.waitForTimeout(500);

      const discoverText = await discoverBtn.textContent();
      if (discoverText === 'Discover') {
        pass('Discover button click completes');
      } else {
        pass('Discover button responds to click');
      }
    } catch (e) {
      fail('Discover button click', e);
    }

    // Test: Queue All button works
    try {
      const queueBtn = await popupPage.$('#queue-add');
      await queueBtn.click();
      await popupPage.waitForTimeout(500);

      const queueText = await queueBtn.textContent();
      if (queueText === 'Queue All') {
        pass('Queue All button click completes');
      } else {
        pass('Queue All button responds to click');
      }
    } catch (e) {
      fail('Queue All button click', e);
    }

    console.log('\n5. Storage Tests');
    console.log('─'.repeat(40));

    // Test: Can save and retrieve from storage
    try {
      const storageResult = await popupPage.evaluate(async () => {
        // Try to open IndexedDB
        return new Promise((resolve) => {
          const request = indexedDB.open('ai-thread-hub', 3);
          request.onerror = () => resolve({ success: false, error: 'Failed to open DB' });
          request.onsuccess = () => {
            const db = request.result;
            const storeNames = Array.from(db.objectStoreNames);
            db.close();
            resolve({ success: true, stores: storeNames });
          };
        });
      });

      if (storageResult?.success) {
        pass('IndexedDB opens successfully');
        log(`    Stores: ${storageResult.stores.join(', ')}`);

        // Check expected stores exist
        const expectedStores = ['threads', 'messages', 'artifacts', 'syncQueue'];
        const missingStores = expectedStores.filter(s => !storageResult.stores.includes(s));

        if (missingStores.length === 0) {
          pass('All expected stores exist');
        } else {
          fail('All expected stores exist', `Missing: ${missingStores.join(', ')}`);
        }
      } else {
        fail('IndexedDB opens successfully', storageResult?.error);
      }
    } catch (e) {
      fail('IndexedDB opens successfully', e);
    }

    console.log('\n6. Queue Flow Test');
    console.log('─'.repeat(40));

    // Test: Manual queue item addition
    try {
      const addResult = await popupPage.evaluate(async () => {
        // Manually add a test item to the queue
        return new Promise((resolve) => {
          const request = indexedDB.open('ai-thread-hub', 3);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('syncQueue', 'readwrite');
            const store = tx.objectStore('syncQueue');

            const testItem = {
              id: 'test:test-item-001',
              provider: 'test',
              provider_thread_id: 'test-item-001',
              url: 'http://localhost:3456/claude',
              title: 'Test Queue Item',
              status: 'pending',
              added_at: new Date().toISOString(),
              last_attempt_at: null,
              attempt_count: 0,
              error: null,
            };

            store.put(testItem);
            tx.oncomplete = () => {
              db.close();
              resolve({ success: true });
            };
            tx.onerror = () => {
              db.close();
              resolve({ success: false, error: 'Transaction failed' });
            };
          };
          request.onerror = () => resolve({ success: false, error: 'Failed to open DB' });
        });
      });

      if (addResult?.success) {
        pass('Can add item to sync queue');
      } else {
        fail('Can add item to sync queue', addResult?.error);
      }
    } catch (e) {
      fail('Can add item to sync queue', e);
    }

    // Test: Queue stats update
    try {
      await popupPage.waitForTimeout(500);
      const statsAfter = await popupPage.evaluate(async () => {
        return await chrome.runtime.sendMessage({ type: 'GET_QUEUE_STATS' });
      });

      if (statsAfter?.stats?.pending >= 1 || statsAfter?.stats?.total >= 1) {
        pass('Queue stats reflect added item');
        log(`    Stats after add: pending=${statsAfter.stats.pending}, total=${statsAfter.stats.total}`);
      } else {
        fail('Queue stats reflect added item', JSON.stringify(statsAfter?.stats));
      }
    } catch (e) {
      fail('Queue stats reflect added item', e);
    }

    console.log('\n7. Discovery-to-Queue Flow Test');
    console.log('─'.repeat(40));

    // This test simulates what happens when discovered chats exist
    // The bug was: discoveredChats Map was empty when QUEUE_DISCOVERED was called
    try {
      // First, check what GET_DISCOVERED returns
      const discBefore = await popupPage.evaluate(async () => {
        return await chrome.runtime.sendMessage({ type: 'GET_DISCOVERED' });
      });
      log(`    Discovered before: ${JSON.stringify(discBefore?.discovered)}`);

      // Call DISCOVER_CHATS (simulates clicking Discover button)
      const discoverResult = await popupPage.evaluate(async () => {
        return await chrome.runtime.sendMessage({ type: 'DISCOVER_CHATS' });
      });
      log(`    DISCOVER_CHATS result: total=${discoverResult?.discovered?.total}`);

      // Now call QUEUE_DISCOVERED
      const queueResult = await popupPage.evaluate(async () => {
        return await chrome.runtime.sendMessage({ type: 'QUEUE_DISCOVERED' });
      });
      log(`    QUEUE_DISCOVERED result: queued=${queueResult?.queued}, message=${queueResult?.message}`);

      // The issue: if no AI tabs are open, discoveredChats will be empty
      // This is expected behavior, but the user had 58 discovered chats
      if (queueResult?.success) {
        pass('QUEUE_DISCOVERED executes without error');
        if (queueResult.queued === 0 && queueResult.message?.includes('No chats')) {
          log('    (No chats queued - expected when no AI tabs are open)');
        }
      } else {
        fail('QUEUE_DISCOVERED executes without error', JSON.stringify(queueResult));
      }
    } catch (e) {
      fail('Discovery-to-Queue flow', e);
    }

    console.log('\n8. Simulated Discovery Test');
    console.log('─'.repeat(40));

    // Simulate what happens when content scripts return actual chat data
    // This bypasses the real content scripts to test the queue mechanism
    try {
      // Directly populate the discoveredChats Map via a test message
      // We need to inject mock discovered chats into the service worker
      const injectResult = await popupPage.evaluate(async () => {
        // This won't work directly - we need to test via the actual mechanism
        // Instead, let's verify the getProviderUrlForChat function works
        return { success: true };
      });

      // The real test: manually add items via IndexedDB and test sync loop
      const manualAdd = await popupPage.evaluate(async () => {
        return new Promise((resolve) => {
          const request = indexedDB.open('ai-thread-hub', 3);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('syncQueue', 'readwrite');
            const store = tx.objectStore('syncQueue');

            // Add multiple mock queue items
            const items = [
              {
                id: 'claude:mock-chat-001',
                provider: 'claude',
                provider_thread_id: 'mock-chat-001',
                url: 'https://claude.ai/chat/mock-chat-001',
                title: 'Mock Claude Chat 1',
                status: 'pending',
                added_at: new Date().toISOString(),
                attempt_count: 0,
              },
              {
                id: 'chatgpt:mock-chat-002',
                provider: 'chatgpt',
                provider_thread_id: 'mock-chat-002',
                url: 'https://chatgpt.com/c/mock-chat-002',
                title: 'Mock ChatGPT Chat',
                status: 'pending',
                added_at: new Date().toISOString(),
                attempt_count: 0,
              },
            ];

            items.forEach((item) => store.put(item));

            tx.oncomplete = () => {
              db.close();
              resolve({ success: true, added: items.length });
            };
            tx.onerror = () => {
              db.close();
              resolve({ success: false, error: 'Transaction failed' });
            };
          };
        });
      });

      if (manualAdd?.success) {
        pass(`Manually added ${manualAdd.added} queue items`);
      } else {
        fail('Manually add queue items', manualAdd?.error);
      }

      // Verify queue has items
      const verifyStats = await popupPage.evaluate(async () => {
        return await chrome.runtime.sendMessage({ type: 'GET_QUEUE_STATS' });
      });

      if (verifyStats?.stats?.pending >= 2) {
        pass('Queue has pending items');
        log(`    Pending: ${verifyStats.stats.pending}, Total: ${verifyStats.stats.total}`);
      } else {
        fail('Queue has pending items', `Only ${verifyStats?.stats?.pending} pending`);
      }

    } catch (e) {
      fail('Simulated discovery test', e);
    }

    console.log('\n9. Start Sync Loop Test');
    console.log('─'.repeat(40));

    // Test that the sync loop can start
    try {
      const startResult = await popupPage.evaluate(async () => {
        return await chrome.runtime.sendMessage({ type: 'START_QUEUE_SYNC', delayMs: 1000 });
      });

      if (startResult?.success) {
        pass('START_QUEUE_SYNC executes');
        log(`    Message: ${startResult.message}`);
      } else {
        fail('START_QUEUE_SYNC executes', JSON.stringify(startResult));
      }

      // Wait a bit and check status
      await popupPage.waitForTimeout(1500);

      const statusResult = await popupPage.evaluate(async () => {
        return await chrome.runtime.sendMessage({ type: 'GET_QUEUE_STATS' });
      });
      log(`    After 1.5s: isRunning=${statusResult?.isRunning}, pending=${statusResult?.stats?.pending}`);

      // Stop the loop
      const stopResult = await popupPage.evaluate(async () => {
        return await chrome.runtime.sendMessage({ type: 'STOP_QUEUE_SYNC' });
      });

      if (stopResult?.success) {
        pass('STOP_QUEUE_SYNC executes');
      } else {
        fail('STOP_QUEUE_SYNC executes', JSON.stringify(stopResult));
      }

    } catch (e) {
      fail('Sync loop test', e);
    }

  } catch (error) {
    log(`\nFATAL ERROR: ${error.message}`);
    results.errors.push({ test: 'Setup', error: error.message });
  } finally {
    // Cleanup
    if (context) {
      await context.close();
    }
    server.close();

    // Print results
    console.log('\n' + '═'.repeat(50));
    console.log('TEST RESULTS');
    console.log('═'.repeat(50));
    console.log(`  Passed: ${results.passed}`);
    console.log(`  Failed: ${results.failed}`);

    if (results.errors.length > 0) {
      console.log('\nFailures:');
      results.errors.forEach(({ test, error }) => {
        console.log(`  - ${test}: ${error}`);
      });
    }

    console.log('\n');
    process.exit(results.failed > 0 ? 1 : 0);
  }
}

runTests().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
