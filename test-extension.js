// Quick test to verify extension loads without errors
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testExtension() {
  console.log('Launching Chrome with extension...');

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${__dirname}`,
      `--load-extension=${__dirname}`,
    ],
  });

  // Collect errors
  const errors = [];

  // Get the service worker
  let serviceWorker;
  try {
    serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      // Wait for it to load
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 5000 });
    }
    console.log('Service worker loaded:', serviceWorker.url());
  } catch (err) {
    errors.push(`Service worker failed to load: ${err.message}`);
  }

  // Open a page and try to access extension
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`Console error: ${msg.text()}`);
    }
  });

  page.on('pageerror', err => {
    errors.push(`Page error: ${err.message}`);
  });

  // Get extension ID from service worker URL
  let extensionId;
  if (serviceWorker) {
    const swUrl = serviceWorker.url();
    const match = swUrl.match(/chrome-extension:\/\/([^/]+)/);
    extensionId = match?.[1];
    console.log('Extension ID:', extensionId);
  }

  if (extensionId) {
    // Try to open popup
    try {
      console.log('Opening popup...');
      await page.goto(`chrome-extension://${extensionId}/ui/popup.html`);
      await page.waitForTimeout(1000);

      // Check if basic elements exist
      const syncBtn = await page.$('#sync');
      const discoverBtn = await page.$('#discover');
      const queuePanel = await page.$('#queue-panel');

      console.log('Sync button:', syncBtn ? 'OK' : 'MISSING');
      console.log('Discover button:', discoverBtn ? 'OK' : 'MISSING');
      console.log('Queue panel:', queuePanel ? 'OK' : 'MISSING');

      // Try clicking discover (won't do much without AI tabs but tests message passing)
      if (discoverBtn) {
        console.log('Testing Discover button...');
        await discoverBtn.click();
        await page.waitForTimeout(500);
        const discoverText = await discoverBtn.textContent();
        console.log('Discover button after click:', discoverText);
      }

      // Check queue stats loaded
      const queuePending = await page.$eval('#queue-pending', el => el.textContent).catch(() => 'ERROR');
      console.log('Queue pending value:', queuePending);

      // Try Sync Now button
      if (syncBtn) {
        console.log('Testing Sync Now button...');
        await syncBtn.click();
        await page.waitForTimeout(1000);
        const syncText = await syncBtn.textContent();
        console.log('Sync button after click:', syncText);
      }

      // Try Queue All button
      const queueAddBtn = await page.$('#queue-add');
      if (queueAddBtn) {
        console.log('Testing Queue All button...');
        await queueAddBtn.click();
        await page.waitForTimeout(500);
        const queueAddText = await queueAddBtn.textContent();
        console.log('Queue All button after click:', queueAddText);
      }

      // Check for any errors in the page
      const bodyText = await page.$eval('body', el => el.innerText);
      if (bodyText.includes('Error') || bodyText.includes('error')) {
        console.log('Page contains error text');
      }

      // Check queue stats after queuing
      await page.waitForTimeout(1000);
      const pendingAfter = await page.$eval('#queue-pending', el => el.textContent).catch(() => 'ERROR');
      console.log('Queue pending after Queue All:', pendingAfter);

      // Try Start button
      const startBtn = await page.$('#queue-start');
      if (startBtn && parseInt(pendingAfter) > 0) {
        console.log('Testing Start button...');
        await startBtn.click();
        await page.waitForTimeout(2000);

        const statusEl = await page.$eval('#queue-status', el => el.textContent).catch(() => 'ERROR');
        console.log('Queue status after Start:', statusEl);
      }

    } catch (err) {
      errors.push(`Popup test failed: ${err.message}`);
    }
  }

  // Print results
  console.log('\n=== TEST RESULTS ===');
  if (errors.length === 0) {
    console.log('✓ No errors detected');
  } else {
    console.log('✗ Errors found:');
    errors.forEach(e => console.log('  -', e));
  }

  // Keep browser open briefly to see results
  await page.waitForTimeout(2000);

  await context.close();

  process.exit(errors.length > 0 ? 1 : 0);
}

testExtension().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
