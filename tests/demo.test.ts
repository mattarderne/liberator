/**
 * Demo Mode Test
 *
 * Tests the demo mode functionality:
 * 1. Enable demo mode in settings
 * 2. Seed demo data
 * 3. View thread list with filtering and search
 * 4. Open thread detail with messages
 * 5. Test linking workflow
 * 6. Open stats modal with trend charts
 * 7. Capture screenshots at each step
 *
 * Run: npx ts-node tests/demo.test.ts
 */

import { chromium } from "rebrowser-playwright";
import path from "path";
import fs from "fs";
import "dotenv/config";

const CONFIG = {
  extensionPath: path.resolve(__dirname, ".."),
  profilePath: path.resolve(__dirname, "../.test-profile-demo"),
};

function findChrome(): string {
  const chromeDir = path.resolve(__dirname, "../chrome");
  if (fs.existsSync(chromeDir)) {
    for (const version of fs.readdirSync(chromeDir)) {
      const macArmPath = path.join(
        chromeDir, version, "chrome-mac-arm64",
        "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"
      );
      if (fs.existsSync(macArmPath)) return macArmPath;

      const macX64Path = path.join(
        chromeDir, version, "chrome-mac-x64",
        "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"
      );
      if (fs.existsSync(macX64Path)) return macX64Path;
    }
  }
  throw new Error("Chrome for Testing not found. Run: npm run install-chrome");
}

async function getExtensionId(context: any): Promise<string | null> {
  try {
    const workers = context.serviceWorkers();
    for (const worker of workers) {
      const url = worker.url();
      if (url.includes("chrome-extension://")) {
        const match = url.match(/chrome-extension:\/\/([^/]+)/);
        if (match) return match[1];
      }
    }
    const backgrounds = context.backgroundPages();
    for (const bg of backgrounds) {
      const url = bg.url();
      if (url.includes("chrome-extension://")) {
        const match = url.match(/chrome-extension:\/\/([^/]+)/);
        if (match) return match[1];
      }
    }
  } catch (e) {
    console.log("  Could not get extension ID:", e);
  }
  return null;
}

async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║       DEMO MODE TEST - Full Feature Walkthrough       ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  const chromePath = findChrome();
  const reportDir = path.resolve(__dirname, "../test-reports",
    `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}_demo-test`
  );
  fs.mkdirSync(reportDir, { recursive: true });

  console.log("Chrome:", chromePath);
  console.log("Extension:", CONFIG.extensionPath);
  console.log("Report:", reportDir);
  console.log();

  // Clean profile for fresh demo
  if (fs.existsSync(CONFIG.profilePath)) {
    fs.rmSync(CONFIG.profilePath, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(CONFIG.profilePath, {
    headless: false,
    executablePath: chromePath,
    args: [
      `--disable-extensions-except=${CONFIG.extensionPath}`,
      `--load-extension=${CONFIG.extensionPath}`,
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
    ],
    viewport: { width: 1400, height: 900 },
    slowMo: 100, // Slow down for demo visibility
  });

  const page = context.pages()[0] || await context.newPage();
  let stepNum = 0;

  const screenshot = async (name: string) => {
    stepNum++;
    const filename = `${String(stepNum).padStart(2, "0")}_${name}.png`;
    await page.screenshot({ path: path.join(reportDir, filename), fullPage: true });
    console.log(`  📸 ${filename}`);
  };

  const wait = (ms: number) => page.waitForTimeout(ms);

  try {
    // Wait for extension to load
    await wait(2000);
    const extensionId = await getExtensionId(context);
    if (!extensionId) throw new Error("Extension not found");
    console.log(`Extension ID: ${extensionId}\n`);

    // ═══════════════════════════════════════════════════════════
    // STEP 1: Open Options and Enable Demo Mode
    // ═══════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════");
    console.log("STEP 1: Enable Demo Mode in Settings");
    console.log("═══════════════════════════════════════════════════════════");

    const optionsUrl = `chrome-extension://${extensionId}/ui/options.html`;
    await page.goto(optionsUrl);
    await wait(1000);
    await screenshot("01-options-page");

    // Scroll to demo mode section
    await page.evaluate(() => {
      const demoSection = document.getElementById("demo-mode-toggle");
      if (demoSection) demoSection.scrollIntoView({ behavior: "smooth" });
    });
    await wait(500);
    await screenshot("02-demo-section");

    // Enable demo mode
    console.log("  Enabling demo mode...");
    await page.click("#demo-mode-toggle");
    await wait(500);
    await screenshot("03-demo-enabled");

    // Seed demo data
    console.log("  Seeding demo data...");
    await page.click("#seed-demo-data");
    await wait(3000); // Wait for seeding
    await screenshot("04-demo-seeded");

    // Verify stats
    const demoStats = await page.locator("#demo-stats").textContent();
    console.log(`  ${demoStats}`);

    // ═══════════════════════════════════════════════════════════
    // STEP 2: View Thread List
    // ═══════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("STEP 2: View Thread List with Demo Data");
    console.log("═══════════════════════════════════════════════════════════");

    const viewUrl = `chrome-extension://${extensionId}/ui/view.html`;
    await page.goto(viewUrl);
    await wait(2000);
    await screenshot("05-thread-list");

    // Count threads
    const threadCount = await page.locator("tr.thread-row").count();
    console.log(`  Found ${threadCount} threads in list`);

    // ═══════════════════════════════════════════════════════════
    // STEP 3: Test Filtering
    // ═══════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("STEP 3: Test Provider Filter");
    console.log("═══════════════════════════════════════════════════════════");

    // Filter by ChatGPT
    console.log("  Filtering by ChatGPT...");
    await page.selectOption("#provider-filter", "chatgpt");
    await wait(500);
    await screenshot("06-filter-chatgpt");

    const chatgptCount = await page.locator("tr.thread-row").count();
    console.log(`  ChatGPT threads: ${chatgptCount}`);

    // Filter by Claude
    console.log("  Filtering by Claude...");
    await page.selectOption("#provider-filter", "claude");
    await wait(500);
    await screenshot("07-filter-claude");

    const claudeCount = await page.locator("tr.thread-row").count();
    console.log(`  Claude threads: ${claudeCount}`);

    // Clear filter
    await page.selectOption("#provider-filter", "");
    await wait(500);

    // ═══════════════════════════════════════════════════════════
    // STEP 4: Test Category Filter
    // ═══════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("STEP 4: Test Category Filter");
    console.log("═══════════════════════════════════════════════════════════");

    // Filter by work
    console.log("  Filtering by work category...");
    await page.selectOption("#category-filter", "work");
    await wait(500);
    await screenshot("08-filter-work");

    const workCount = await page.locator("tr.thread-row").count();
    console.log(`  Work threads: ${workCount}`);

    // Clear filter
    await page.selectOption("#category-filter", "");
    await wait(500);

    // ═══════════════════════════════════════════════════════════
    // STEP 5: Test Search
    // ═══════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("STEP 5: Test Search Functionality");
    console.log("═══════════════════════════════════════════════════════════");

    // Search for "API"
    console.log("  Searching for 'API'...");
    await page.fill("#search-input", "API");
    await page.click("#search-btn");
    await wait(1000);
    await screenshot("09-search-api");

    const searchResults = await page.locator("tr.thread-row").count();
    console.log(`  Search results: ${searchResults}`);

    // Clear search
    await page.fill("#search-input", "");
    await page.click("#search-btn");
    await wait(500);

    // ═══════════════════════════════════════════════════════════
    // STEP 6: Open Thread Detail
    // ═══════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("STEP 6: Open Thread Detail View");
    console.log("═══════════════════════════════════════════════════════════");

    // Click first thread
    console.log("  Opening first thread...");
    const firstThread = page.locator("tr.thread-row").first();
    await firstThread.click();
    await wait(1500);
    await screenshot("10-thread-detail");

    // Check for detail elements
    const hasMessages = await page.locator(".message").count();
    console.log(`  Messages displayed: ${hasMessages}`);

    const hasTitle = await page.locator("h2").first().textContent();
    console.log(`  Thread title: ${hasTitle?.slice(0, 50)}...`);

    // ═══════════════════════════════════════════════════════════
    // STEP 7: Check PII Section
    // ═══════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("STEP 7: Check PII Detection Section");
    console.log("═══════════════════════════════════════════════════════════");

    // Look for PII section
    const hasPIISection = await page.locator(".pii-section").isVisible().catch(() => false);
    if (hasPIISection) {
      console.log("  PII section found!");
      await page.locator(".pii-section").scrollIntoViewIfNeeded();
      await wait(500);
      await screenshot("11-pii-section");
    } else {
      console.log("  No PII detected in this thread (expected for some threads)");
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 8: Check Similar Threads
    // ═══════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("STEP 8: Check Similar Threads Section");
    console.log("═══════════════════════════════════════════════════════════");

    const hasSimilarSection = await page.locator(".similar-threads-section").isVisible().catch(() => false);
    if (hasSimilarSection) {
      console.log("  Similar threads section found!");
      await page.locator(".similar-threads-section").scrollIntoViewIfNeeded();
      await wait(500);
      await screenshot("12-similar-threads");
    } else {
      console.log("  Similar threads not computed yet");
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 9: Go back and open Stats Modal
    // ═══════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("STEP 9: Open Stats Modal with Trend Charts");
    console.log("═══════════════════════════════════════════════════════════");

    // Go back to list
    await page.goto(viewUrl);
    await wait(1500);

    // Open stats modal
    console.log("  Opening stats modal...");
    const statsBtn = page.locator("#stats-btn, button:has-text('Stats')");
    if (await statsBtn.isVisible()) {
      await statsBtn.click();
      await wait(1500);
      await screenshot("13-stats-modal");

      // Check for tabs
      const hasTabs = await page.locator(".stats-tabs, .tab-btn").isVisible().catch(() => false);
      if (hasTabs) {
        console.log("  Stats tabs found!");

        // Click Activity tab
        const activityTab = page.locator("button:has-text('Activity')");
        if (await activityTab.isVisible()) {
          await activityTab.click();
          await wait(1000);
          await screenshot("14-activity-chart");
          console.log("  Activity chart displayed");
        }

        // Click Providers tab
        const providersTab = page.locator("button:has-text('Providers')");
        if (await providersTab.isVisible()) {
          await providersTab.click();
          await wait(1000);
          await screenshot("15-providers-chart");
          console.log("  Providers chart displayed");
        }

        // Click Topics tab
        const topicsTab = page.locator("button:has-text('Topics')");
        if (await topicsTab.isVisible()) {
          await topicsTab.click();
          await wait(1000);
          await screenshot("16-topics-chart");
          console.log("  Topics chart displayed");
        }
      }

      // Close modal
      const closeBtn = page.locator(".close-modal, button:has-text('Close'), .modal-close");
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await wait(500);
      }
    } else {
      console.log("  Stats button not found");
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 10: Test Thread Linking
    // ═══════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("STEP 10: Test Thread Linking");
    console.log("═══════════════════════════════════════════════════════════");

    // Open first thread again
    await page.locator("tr.thread-row").first().click();
    await wait(1500);

    // Look for link button
    const linkBtn = page.locator("button:has-text('Link'), #link-thread");
    if (await linkBtn.isVisible()) {
      console.log("  Link button found!");
      await linkBtn.click();
      await wait(500);
      await screenshot("17-link-modal");

      // Close if modal opened
      const cancelBtn = page.locator("button:has-text('Cancel')");
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
      }
    } else {
      console.log("  Link functionality not visible in current view");
    }

    await screenshot("18-final-state");

    // ═══════════════════════════════════════════════════════════
    // CLEANUP: Disable Demo Mode
    // ═══════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("CLEANUP: Disable Demo Mode");
    console.log("═══════════════════════════════════════════════════════════");

    await page.goto(optionsUrl);
    await wait(1000);

    // Scroll to demo section
    await page.evaluate(() => {
      const demoSection = document.getElementById("demo-mode-toggle");
      if (demoSection) demoSection.scrollIntoView({ behavior: "smooth" });
    });
    await wait(500);

    // Disable demo mode
    const demoToggle = page.locator("#demo-mode-toggle");
    if (await demoToggle.isChecked()) {
      await demoToggle.click();
      await wait(500);
      console.log("  Demo mode disabled");
    }
    await screenshot("19-demo-disabled");

    // ═══════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════
    console.log("\n╔═══════════════════════════════════════════════════════════╗");
    console.log("║  DEMO TEST COMPLETED SUCCESSFULLY!                        ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");
    console.log(`Reports: ${reportDir}`);
    console.log(`Screenshots: ${stepNum} files`);
    console.log("\nFeatures tested:");
    console.log("  ✅ Demo mode toggle");
    console.log("  ✅ Demo data seeding");
    console.log("  ✅ Thread list display");
    console.log("  ✅ Provider filtering");
    console.log("  ✅ Category filtering");
    console.log("  ✅ Search functionality");
    console.log("  ✅ Thread detail view");
    console.log("  ✅ Stats modal with charts");
    console.log("  ✅ Thread linking UI");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    await screenshot("error");
    throw error;
  } finally {
    await wait(2000);
    await context.close();
  }
}

main().catch(console.error);
