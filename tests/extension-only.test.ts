/**
 * Extension-Only Test
 *
 * Tests the extension functionality without needing to log into AI sites.
 * Verifies popup, storage, and basic functionality work.
 *
 * Run: npx ts-node tests/extension-only.test.ts
 */

import { chromium } from "rebrowser-playwright";
import path from "path";
import fs from "fs";
import "dotenv/config";

const CONFIG = {
  extensionPath: path.resolve(__dirname, ".."),
  profilePath: path.resolve(__dirname, "../.test-profile"),
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

async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║       EXTENSION-ONLY TEST (No Login Required)         ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  const chromePath = findChrome();
  const reportDir = path.resolve(__dirname, "../test-reports",
    `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}_extension-test`
  );
  fs.mkdirSync(reportDir, { recursive: true });

  console.log("Chrome:", chromePath);
  console.log("Extension:", CONFIG.extensionPath);
  console.log("Report:", reportDir);
  console.log();

  const context = await chromium.launchPersistentContext(CONFIG.profilePath, {
    headless: false,
    executablePath: chromePath,
    args: [
      `--disable-extensions-except=${CONFIG.extensionPath}`,
      `--load-extension=${CONFIG.extensionPath}`,
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
    ],
    viewport: { width: 1280, height: 900 },
  });

  const page = context.pages()[0] || await context.newPage();
  let stepNum = 0;

  const screenshot = async (name: string) => {
    stepNum++;
    const filename = `${String(stepNum).padStart(2, "0")}_${name}.png`;
    await page.screenshot({ path: path.join(reportDir, filename) });
    console.log(`  📸 ${filename}`);
  };

  try {
    // Test 1: Open a simple page (no Cloudflare)
    console.log("\n📝 Test 1: Load extension on simple page");
    await page.goto("https://example.com");
    await page.waitForTimeout(2000);
    await screenshot("example-com");

    // Test 2: Get extension ID and open popup
    console.log("\n📝 Test 2: Find extension and open popup");

    // Get extension ID from service worker
    const extensionId = await getExtensionId(context);
    console.log(`  Extension ID: ${extensionId || "not found"}`);

    if (extensionId) {
      // Open extension popup directly
      const popupUrl = `chrome-extension://${extensionId}/ui/popup.html`;
      await page.goto(popupUrl);
      await page.waitForTimeout(1000);
      await screenshot("popup-opened");

      // Test 3: Check popup content
      console.log("\n📝 Test 3: Verify popup UI elements");

      const hasTitle = await page.locator("h3").textContent();
      console.log(`  Title: ${hasTitle}`);

      const syncBtn = await page.locator("#sync").isVisible();
      console.log(`  Sync button visible: ${syncBtn}`);

      const discoverBtn = await page.locator("#discover").isVisible();
      console.log(`  Discover button visible: ${discoverBtn}`);

      const statsVisible = await page.locator("#stats").isVisible();
      console.log(`  Stats visible: ${statsVisible}`);

      await screenshot("popup-ui-check");

      // Test 4: Click Sync (should work even with no AI tabs)
      console.log("\n📝 Test 4: Click Sync Now");
      await page.click("#sync");
      await page.waitForTimeout(2000);
      await screenshot("after-sync");

      // Test 5: Check if threads container exists
      console.log("\n📝 Test 5: Check threads display");
      const threadsHtml = await page.locator("#threads").innerHTML();
      console.log(`  Threads container content length: ${threadsHtml.length} chars`);

      // Check if we have synced threads (from manual testing earlier)
      const threadCount = await page.locator(".thread").count();
      console.log(`  Thread cards found: ${threadCount}`);

      await screenshot("threads-display");

      // Test 6: Test search functionality
      console.log("\n📝 Test 6: Test search");
      await page.fill("#search", "test");
      await page.waitForTimeout(300);
      await screenshot("search-test");

      await page.fill("#search", "");
      await page.waitForTimeout(300);

      // Test 7: Test filter dropdowns
      console.log("\n📝 Test 7: Test filters");
      await page.selectOption("#provider-filter", "claude");
      await page.waitForTimeout(300);
      await screenshot("filter-claude");

      await page.selectOption("#provider-filter", "");
      await page.waitForTimeout(300);

    } else {
      console.log("  ⚠️ Could not find extension ID");
    }

    // Test 8: Try ChatGPT (might not have Cloudflare)
    console.log("\n📝 Test 8: Try ChatGPT homepage");
    await page.goto("https://chatgpt.com");
    await page.waitForTimeout(3000);
    await screenshot("chatgpt-attempt");

    // Check if blocked
    const chatgptBlocked = await page.content().then(c =>
      c.includes("Verify you are human") || c.includes("cf-turnstile")
    );
    console.log(`  ChatGPT blocked: ${chatgptBlocked}`);

    // Test 9: Try Gemini
    console.log("\n📝 Test 9: Try Gemini homepage");
    await page.goto("https://gemini.google.com");
    await page.waitForTimeout(3000);
    await screenshot("gemini-attempt");

    const geminiBlocked = await page.content().then(c =>
      c.includes("Verify you are human") || c.includes("unusual traffic")
    );
    console.log(`  Gemini blocked: ${geminiBlocked}`);

    // Summary
    console.log("\n╔═══════════════════════════════════════════════════════╗");
    console.log("║  TEST COMPLETED                                       ║");
    console.log("╚═══════════════════════════════════════════════════════╝\n");
    console.log(`Reports: ${reportDir}`);
    console.log(`Screenshots: ${stepNum} files`);

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    await screenshot("error");
  } finally {
    await context.close();
  }
}

async function getExtensionId(context: any): Promise<string | null> {
  try {
    // Get all service workers
    const workers = context.serviceWorkers();
    for (const worker of workers) {
      const url = worker.url();
      if (url.includes("chrome-extension://")) {
        const match = url.match(/chrome-extension:\/\/([^/]+)/);
        if (match) return match[1];
      }
    }

    // Alternative: check background page
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

main().catch(console.error);
