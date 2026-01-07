/**
 * ChatGPT Extension Test
 *
 * Tests the extension on ChatGPT (which doesn't block like Claude).
 * Requires manual login first: npm run login:chatgpt
 *
 * Run: npx ts-node tests/chatgpt.test.ts
 */

import { chromium, BrowserContext } from "rebrowser-playwright";
import path from "path";
import fs from "fs";
import "dotenv/config";

const CONFIG = {
  extensionPath: path.resolve(__dirname, ".."),
  profilePath: path.resolve(__dirname, "../.test-profile-chatgpt"),
  targetUrl: "https://chatgpt.com",
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
    }
  }
  throw new Error("Chrome not found");
}

async function getExtensionId(context: BrowserContext, maxWait = 10000): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    // Check service workers
    for (const worker of context.serviceWorkers()) {
      const match = worker.url().match(/chrome-extension:\/\/([^/]+)/);
      if (match) return match[1];
    }
    // Check background pages
    for (const bg of context.backgroundPages()) {
      const match = bg.url().match(/chrome-extension:\/\/([^/]+)/);
      if (match) return match[1];
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║         CHATGPT EXTENSION TEST                        ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  const chromePath = findChrome();
  const reportDir = path.resolve(__dirname, "../test-reports",
    `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}_chatgpt-test`
  );
  fs.mkdirSync(reportDir, { recursive: true });

  console.log("Chrome:", chromePath);
  console.log("Profile:", CONFIG.profilePath);
  console.log("Report:", reportDir);

  // Clean stale locks
  for (const lock of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    const lockPath = path.join(CONFIG.profilePath, lock);
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
  }

  const context = await chromium.launchPersistentContext(CONFIG.profilePath, {
    headless: false,
    executablePath: chromePath,
    args: [
      `--disable-extensions-except=${CONFIG.extensionPath}`,
      `--load-extension=${CONFIG.extensionPath}`,
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
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
    return filename;
  };

  const getExtLogs = async (): Promise<any[]> => {
    try {
      return await page.evaluate(async () => {
        return new Promise<any[]>((resolve) => {
          const handler = (e: Event) => {
            try {
              resolve(JSON.parse((e as CustomEvent).detail));
            } catch {
              resolve([]);
            }
          };
          window.addEventListener("__threadhub_logs_response__", handler, { once: true });
          window.dispatchEvent(new Event("__threadhub_get_logs__"));
          setTimeout(() => resolve([]), 2000);
        });
      });
    } catch {
      return [];
    }
  };

  try {
    // Step 1: Wait for extension to load
    console.log("\n📝 Step 1: Wait for extension");
    const extensionId = await getExtensionId(context);
    console.log(`  Extension ID: ${extensionId || "not found"}`);

    // Step 2: Navigate to ChatGPT
    console.log("\n📝 Step 2: Navigate to ChatGPT");
    await page.goto(CONFIG.targetUrl);
    await page.waitForTimeout(3000);
    await screenshot("chatgpt-loaded");

    // Check if logged in or need login
    const needsLogin = await page.locator('text="Log in"').isVisible().catch(() => false);
    console.log(`  Needs login: ${needsLogin}`);

    if (needsLogin) {
      console.log("\n  ⚠️  Not logged in. Run this first to save session:");
      console.log("     npm run login:chatgpt");
      console.log("     (Opens browser, log in manually, press Enter)");
    }

    // Step 3: Check extension logs
    console.log("\n📝 Step 3: Check extension logs");
    const logs = await getExtLogs();
    console.log(`  Extension logs: ${logs.length}`);
    if (logs.length > 0) {
      console.log("  Recent:");
      logs.slice(-3).forEach(l => console.log(`    [${l.s}] ${l.m?.slice(0, 50)}`));
    }

    // Step 4: Test extension popup
    if (extensionId) {
      console.log("\n📝 Step 4: Open extension popup");
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/ui/popup.html`);
      await popupPage.waitForTimeout(1000);

      // Take popup screenshot
      await popupPage.screenshot({ path: path.join(reportDir, `${String(++stepNum).padStart(2, "0")}_popup.png`) });
      console.log(`  📸 popup.png`);

      // Check UI elements
      const title = await popupPage.locator("h3").textContent();
      console.log(`  Title: ${title}`);

      const syncBtn = await popupPage.locator("#sync").isVisible();
      const discoverBtn = await popupPage.locator("#discover").isVisible();
      console.log(`  Buttons: sync=${syncBtn}, discover=${discoverBtn}`);

      // Click Discover
      console.log("\n📝 Step 5: Click Discover");
      await popupPage.click("#discover");
      await popupPage.waitForTimeout(2000);
      await popupPage.screenshot({ path: path.join(reportDir, `${String(++stepNum).padStart(2, "0")}_after-discover.png`) });
      console.log(`  📸 after-discover.png`);

      // Click Sync
      console.log("\n📝 Step 6: Click Sync");
      await popupPage.click("#sync");
      await popupPage.waitForTimeout(2000);
      await popupPage.screenshot({ path: path.join(reportDir, `${String(++stepNum).padStart(2, "0")}_after-sync.png`) });
      console.log(`  📸 after-sync.png`);

      // Check thread count
      const threadCount = await popupPage.locator(".thread").count();
      console.log(`  Threads found: ${threadCount}`);

      // Check stats
      const syncedCount = await popupPage.locator("#total-count").textContent();
      const discoveredCount = await popupPage.locator("#discovered-count").textContent();
      console.log(`  Stats: ${syncedCount} synced, ${discoveredCount} discovered`);

      await popupPage.close();
    }

    // Step 7: Final screenshot
    console.log("\n📝 Step 7: Final state");
    await page.bringToFront();
    await screenshot("final");

    // Save logs
    const allLogs = await getExtLogs();
    fs.writeFileSync(
      path.join(reportDir, "extension-logs.json"),
      JSON.stringify(allLogs, null, 2)
    );
    console.log(`  Saved ${allLogs.length} extension logs`);

    console.log("\n╔═══════════════════════════════════════════════════════╗");
    console.log("║  TEST COMPLETED                                       ║");
    console.log("╚═══════════════════════════════════════════════════════╝");
    console.log(`\nReports: ${reportDir}`);

  } catch (error) {
    console.error("\n❌ Error:", error);
    await screenshot("error");
  } finally {
    await context.close();
  }
}

main().catch(console.error);
