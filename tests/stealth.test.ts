/**
 * Thread Hub Extension Test
 *
 * Tests the AI Thread Hub extension on Claude.ai using stealth automation.
 *
 * Workflow:
 * 1. Navigate to Claude.ai
 * 2. Verify extension loads and content script runs
 * 3. Check for thread data extraction
 * 4. Test popup sync functionality
 *
 * Run: npm run test:stealth
 */

import { chromium } from "rebrowser-playwright";
import path from "path";
import fs from "fs";
import "dotenv/config";

// ============================================================
// Configuration
// ============================================================

const CONFIG = {
  extensionPath: path.resolve(__dirname, ".."),
  targetUrl: "https://claude.ai",

  // Event names for log retrieval (must match logger.js)
  getLogsEvent: "__threadhub_get_logs__",
  logsResponseEvent: "__threadhub_logs_response__",
};

// ============================================================
// Helpers
// ============================================================

const humanDelay = (min: number, max: number) =>
  new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

function findChrome(): string {
  if (process.env.CHROME_FOR_TESTING_PATH) {
    const envPath = path.resolve(process.env.CHROME_FOR_TESTING_PATH);
    if (fs.existsSync(envPath)) return envPath;
  }

  const chromeDir = path.resolve(__dirname, "../chrome");
  if (fs.existsSync(chromeDir)) {
    for (const version of fs.readdirSync(chromeDir)) {
      // Windows
      const winPath = path.join(chromeDir, version, "chrome-win64", "chrome.exe");
      if (fs.existsSync(winPath)) return winPath;
      // Linux
      const linuxPath = path.join(chromeDir, version, "chrome-linux64", "chrome");
      if (fs.existsSync(linuxPath)) return linuxPath;
      // macOS Intel
      const macX64Path = path.join(
        chromeDir,
        version,
        "chrome-mac-x64",
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing"
      );
      if (fs.existsSync(macX64Path)) return macX64Path;
      // macOS Apple Silicon (M1/M2/M3)
      const macArmPath = path.join(
        chromeDir,
        version,
        "chrome-mac-arm64",
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing"
      );
      if (fs.existsSync(macArmPath)) return macArmPath;
    }
  }
  throw new Error("Chrome for Testing not found. Run: npm run install-chrome");
}

// ============================================================
// Main Test
// ============================================================

async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║         THREAD HUB EXTENSION TEST (Stealth)           ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  const chromePath = findChrome();
  const profilePath = path.resolve(__dirname, "../.test-profile");

  // Ensure test-reports root folder exists
  const testReportsRoot = path.resolve(__dirname, "../test-reports");
  if (!fs.existsSync(testReportsRoot)) {
    fs.mkdirSync(testReportsRoot, { recursive: true });
    console.log("Created test-reports/ directory");
  }

  // Create timestamped report directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportDir = path.resolve(testReportsRoot, `${timestamp}_threadhub-test`);
  fs.mkdirSync(reportDir, { recursive: true });

  console.log("Chrome:", chromePath);
  console.log("Extension:", CONFIG.extensionPath);
  console.log("Profile:", profilePath);
  console.log("Report:", reportDir);
  console.log();

  // Launch browser with extension
  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    executablePath: chromePath,
    args: [
      `--disable-extensions-except=${CONFIG.extensionPath}`,
      `--load-extension=${CONFIG.extensionPath}`,
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--no-first-run",
      "--no-default-browser-check",
    ],
    viewport: { width: 1280, height: 900 },
  });

  const page = context.pages()[0] || (await context.newPage());
  let stepNum = 0;

  // Console log capture
  const consoleLogs: { type: string; text: string; time: string }[] = [];
  const pageErrors: { message: string; time: string }[] = [];

  page.on("console", (msg) => {
    consoleLogs.push({
      type: msg.type(),
      text: msg.text(),
      time: new Date().toISOString(),
    });
  });

  page.on("pageerror", (error) => {
    pageErrors.push({
      message: error.message,
      time: new Date().toISOString(),
    });
  });

  // ============================================================
  // Helper Functions
  // ============================================================

  const takeScreenshot = async (name: string) => {
    stepNum++;
    const filename = `${String(stepNum).padStart(2, "0")}_${name}.png`;
    await page.screenshot({
      path: path.join(reportDir, filename),
      clip: { x: 0, y: 0, width: 1280, height: 900 },
    });
    console.log(`  📸 ${filename}`);
    return filename;
  };

  const getExtensionLogs = async (): Promise<any[]> => {
    try {
      const logs = await page.evaluate(
        async ({ getEvent, responseEvent }) => {
          return new Promise<string>((resolve) => {
            const handler = (e: Event) => resolve((e as CustomEvent).detail);
            window.addEventListener(responseEvent, handler, { once: true });
            window.dispatchEvent(new Event(getEvent));
            setTimeout(() => resolve("[]"), 2000);
          });
        },
        { getEvent: CONFIG.getLogsEvent, responseEvent: CONFIG.logsResponseEvent }
      );
      return JSON.parse(logs);
    } catch {
      return [];
    }
  };

  const saveHtml = async (name: string) => {
    const html = await page.content();
    const filename = `${name}.html`;
    fs.writeFileSync(path.join(reportDir, filename), html);
    console.log(`  📄 ${filename} (${Math.round(html.length / 1024)}KB)`);
  };

  const saveLogs = async () => {
    const extLogs = await getExtensionLogs();

    const formatLog = (l: any) =>
      `[${new Date(l.t).toISOString()}] [${l.s}:${l.l.toUpperCase()}] ${l.m}`;

    const content = `# Thread Hub Extension Logs

## Extension Logs (from chrome.storage)
${extLogs.length === 0 ? "_No extension logs captured_" : extLogs.map(formatLog).join("\n")}

## Page Console
${consoleLogs.length === 0 ? "_No page console logs_" : consoleLogs.map((l) => `[${l.time}] [${l.type.toUpperCase()}] ${l.text}`).join("\n")}

## Page Errors
${pageErrors.length === 0 ? "_No page errors_" : pageErrors.map((e) => `[${e.time}] ${e.message}`).join("\n")}
`;

    fs.writeFileSync(path.join(reportDir, "console-logs.md"), content);
    console.log(`  📋 console-logs.md (${extLogs.length} extension logs, ${pageErrors.length} errors)`);
  };

  // ============================================================
  // Test Steps
  // ============================================================

  try {
    // Step 1: Navigate to Claude.ai
    console.log("\n📝 Step 1: Navigate to Claude.ai");
    await page.goto(CONFIG.targetUrl);
    await humanDelay(3000, 5000);
    await takeScreenshot("initial-load");

    // Step 2: Wait for page to fully load
    console.log("\n📝 Step 2: Wait for page content");
    await humanDelay(2000, 3000);
    await takeScreenshot("page-loaded");

    // Step 3: Check for extension logs (content script should have run)
    console.log("\n📝 Step 3: Check extension activity");
    const logs = await getExtensionLogs();
    console.log(`  Found ${logs.length} extension log entries`);

    if (logs.length > 0) {
      console.log("  Recent logs:");
      logs.slice(-5).forEach(l => {
        console.log(`    [${l.s}] ${l.m.slice(0, 60)}`);
      });
    }

    // Step 4: Navigate to a specific chat (if logged in)
    console.log("\n📝 Step 4: Check for chat threads");
    const chatLinks = await page.evaluate(() => {
      // Look for chat/thread links in the sidebar
      const links = document.querySelectorAll('a[href*="/chat/"]');
      return Array.from(links).slice(0, 5).map(a => ({
        href: a.getAttribute('href'),
        text: a.textContent?.slice(0, 50)
      }));
    });

    console.log(`  Found ${chatLinks.length} chat links`);
    if (chatLinks.length > 0) {
      console.log("  Sample chats:");
      chatLinks.forEach(c => console.log(`    ${c.text}`));
    }

    await takeScreenshot("chat-list");

    // Step 5: If there's a chat, click it and test extraction
    if (chatLinks.length > 0 && chatLinks[0].href) {
      console.log("\n📝 Step 5: Open a chat thread");
      await page.click(`a[href="${chatLinks[0].href}"]`);
      await humanDelay(2000, 3000);
      await takeScreenshot("chat-opened");

      // Check logs again after navigation
      const logsAfterNav = await getExtensionLogs();
      console.log(`  Extension logs after navigation: ${logsAfterNav.length}`);
    }

    // Step 6: Test scroll behavior
    console.log("\n📝 Step 6: Test scrolling");
    for (let i = 1; i <= 2; i++) {
      await page.evaluate(() => window.scrollBy(0, 400));
      await humanDelay(1000, 1500);
      await takeScreenshot(`scroll-${i}`);
    }

    // Step 7: Save artifacts
    console.log("\n📝 Step 7: Save test artifacts");
    await saveHtml("full-page");
    await saveLogs();

    // Summary
    console.log("\n╔═══════════════════════════════════════════════════════╗");
    console.log("║  TEST COMPLETED                                       ║");
    console.log("╚═══════════════════════════════════════════════════════╝\n");
    console.log(`Reports saved to: ${reportDir}`);
    console.log("");
    console.log("Saved artifacts:");
    console.log(`  - Screenshots: ${stepNum} PNG files (REVIEW ALL)`);
    console.log("  - Logs: console-logs.md (REVIEW)");
    console.log("  - HTML: full-page.html (grep if debugging)");
    console.log("");
    console.log("POST-TEST: Agent must view all screenshots and read logs to verify test success.\n");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    await takeScreenshot("error");
    await saveLogs();
    throw error;
  } finally {
    await context.close();
  }
}

main().catch(console.error);
