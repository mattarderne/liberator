/**
 * Demo Video Recording Script
 *
 * Records a demo video of the Liberator extension in action.
 * Uses Playwright with Chrome for Testing to:
 * 1. Enable demo mode and seed data
 * 2. Show popup functionality
 * 3. Demonstrate search and filtering
 * 4. Open thread detail view
 *
 * Output: demo/demo.mp4 (for landing page)
 *
 * Run: npx ts-node scripts/record-demo.ts
 */

import { chromium, Browser, BrowserContext, Page } from "rebrowser-playwright";
import path from "path";
import fs from "fs";
import "dotenv/config";

const CONFIG = {
  extensionPath: path.resolve(__dirname, ".."),
  profilePath: path.resolve(__dirname, "../.demo-recording-profile"),
  outputDir: path.resolve(__dirname, "../demo"),
  videoName: "demo.webm",
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

async function getExtensionId(context: BrowserContext): Promise<string | null> {
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
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║       LIBERATOR DEMO VIDEO RECORDING                      ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const chromePath = findChrome();

  // Ensure output directory exists
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  // Clean profile for fresh start
  if (fs.existsSync(CONFIG.profilePath)) {
    fs.rmSync(CONFIG.profilePath, { recursive: true });
  }

  console.log("Chrome:", chromePath);
  console.log("Extension:", CONFIG.extensionPath);
  console.log("Output:", path.join(CONFIG.outputDir, CONFIG.videoName));
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
    viewport: { width: 1280, height: 720 },
    slowMo: 150, // Slow down for demo visibility
    recordVideo: {
      dir: CONFIG.outputDir,
      size: { width: 1280, height: 720 },
    },
  });

  const page = context.pages()[0] || await context.newPage();
  const wait = (ms: number) => page.waitForTimeout(ms);

  try {
    // Wait for extension to load
    await wait(2000);
    const extensionId = await getExtensionId(context);
    if (!extensionId) throw new Error("Extension not found");
    console.log(`Extension ID: ${extensionId}\n`);

    // ═══════════════════════════════════════════════════════════
    // SCENE 1: Setup - Enable Demo Mode
    // ═══════════════════════════════════════════════════════════
    console.log("Scene 1: Setting up demo mode...");

    const optionsUrl = `chrome-extension://${extensionId}/ui/options.html`;
    await page.goto(optionsUrl);
    await wait(1000);

    // Scroll to demo section
    await page.evaluate(() => {
      const demoSection = document.getElementById("database-select");
      if (demoSection) demoSection.scrollIntoView({ behavior: "smooth" });
    });
    await wait(500);

    // Switch to demo database
    await page.selectOption("#database-select", "demo");
    await wait(500);

    // Seed demo data
    console.log("  Seeding demo data...");
    await page.click("#seed-demo-data");
    await wait(3000); // Wait for seeding

    console.log("  Demo data ready!\n");

    // ═══════════════════════════════════════════════════════════
    // SCENE 2: Landing Page
    // ═══════════════════════════════════════════════════════════
    console.log("Scene 2: Showing landing page...");

    // Navigate to landing page (using file:// since it's local)
    await page.goto(`file://${path.join(CONFIG.extensionPath, "landing.html")}`);
    await wait(2000);

    // Scroll down slowly to show features
    await page.evaluate(() => {
      window.scrollTo({ top: 600, behavior: "smooth" });
    });
    await wait(1500);

    console.log("  Landing page shown\n");

    // ═══════════════════════════════════════════════════════════
    // SCENE 3: Search Page Demo
    // ═══════════════════════════════════════════════════════════
    console.log("Scene 3: Search functionality...");

    // Use the minimal search page for cleaner demo
    const searchUrl = `chrome-extension://${extensionId}/ui/search-minimal.html`;
    await page.goto(searchUrl);
    await wait(2000);

    // Type a search query (instant search - no button needed)
    console.log("  Searching for 'API'...");
    await page.fill("#search", "API");
    await wait(1500);

    // Filter by Claude
    console.log("  Filtering by Claude...");
    const claudeFilter = page.locator(".filter-btn[data-provider='claude']");
    if (await claudeFilter.isVisible()) {
      await claudeFilter.click();
      await wait(1000);
    }

    // Clear filter
    const allFilter = page.locator(".filter-btn[data-provider='']");
    if (await allFilter.isVisible()) {
      await allFilter.click();
      await wait(500);
    }

    console.log("  Search demo complete\n");

    // ═══════════════════════════════════════════════════════════
    // SCENE 4: Thread Detail
    // ═══════════════════════════════════════════════════════════
    console.log("Scene 4: Thread detail view...");

    // Click on a thread from the minimal search page
    const firstThread = page.locator(".thread-item").first();
    if (await firstThread.isVisible()) {
      await firstThread.click();
      await wait(2500);

      // Scroll down to show messages
      await page.evaluate(() => {
        const msgContainer = document.querySelector(".message-list, .detail-content, .messages");
        if (msgContainer) {
          msgContainer.scrollTo({ top: 300, behavior: "smooth" });
        }
        // Also try scrolling main content
        window.scrollTo({ top: 300, behavior: "smooth" });
      });
      await wait(1500);

      console.log("  Thread detail shown\n");
    } else {
      console.log("  No threads found to click\n");
    }

    // ═══════════════════════════════════════════════════════════
    // SCENE 5: Popup Demo
    // ═══════════════════════════════════════════════════════════
    console.log("Scene 5: Popup quick access...");

    // Use the minimal popup for cleaner demo
    const popupUrl = `chrome-extension://${extensionId}/ui/popup-minimal.html`;
    await page.goto(popupUrl);
    await wait(1500);

    // Type in search
    const popupSearch = page.locator("#search");
    if (await popupSearch.isVisible()) {
      await popupSearch.fill("code");
      await wait(1000);

      // Navigate with keyboard
      await page.keyboard.press("ArrowDown");
      await wait(400);
      await page.keyboard.press("ArrowDown");
      await wait(400);
    }

    console.log("  Popup demo complete\n");

    // ═══════════════════════════════════════════════════════════
    // FINAL: Show landing page again
    // ═══════════════════════════════════════════════════════════
    console.log("Scene 6: Final CTA...");

    await page.goto(`file://${path.join(CONFIG.extensionPath, "landing.html")}`);
    await wait(1500);

    // Scroll to CTA
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight - 800, behavior: "smooth" });
    });
    await wait(2000);

    console.log("  Recording complete!\n");

  } catch (error) {
    console.error("\n❌ Recording failed:", error);
    throw error;
  } finally {
    await wait(1000);
    await context.close();

    // Find and rename the video file
    const files = fs.readdirSync(CONFIG.outputDir);
    const videoFile = files.find(f => f.endsWith(".webm") && f !== CONFIG.videoName);
    if (videoFile) {
      const oldPath = path.join(CONFIG.outputDir, videoFile);
      const newPath = path.join(CONFIG.outputDir, CONFIG.videoName);
      fs.renameSync(oldPath, newPath);
      console.log(`Video saved: ${newPath}`);
    }
  }

  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║  DEMO RECORDING COMPLETED!                                ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  console.log("Next steps:");
  console.log("1. Convert to MP4: ffmpeg -i demo/demo.webm -c:v libx264 demo/demo.mp4");
  console.log("2. Add voiceover using video editing software");
  console.log("3. Update landing.html to use the video");
}

main().catch(console.error);
