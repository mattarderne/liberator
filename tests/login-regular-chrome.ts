/**
 * Login Helper Using Regular Chrome
 *
 * Uses your actual Chrome installation with existing cookies/session.
 * This bypasses Cloudflare because it's your trusted browser.
 *
 * Usage: npx ts-node tests/login-regular-chrome.ts
 */

import { chromium } from "rebrowser-playwright";
import path from "path";
import fs from "fs";
import os from "os";
import "dotenv/config";

// ============================================================
// Configuration
// ============================================================

const CONFIG = {
  targetUrl: "https://claude.ai",
  extensionPath: path.resolve(__dirname, ".."),
  // We'll copy cookies to test profile after login verification
  testProfilePath: path.resolve(__dirname, "../.test-profile"),
};

// Find regular Chrome installation
function findRegularChrome(): string {
  const platform = os.platform();

  if (platform === "darwin") {
    // macOS
    const paths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      `${os.homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
  } else if (platform === "win32") {
    // Windows
    const paths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
  } else {
    // Linux
    const paths = [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
  }

  throw new Error("Regular Chrome not found. Please install Google Chrome.");
}

// Find Chrome user data directory
function findChromeUserData(): string {
  const platform = os.platform();
  const home = os.homedir();

  if (platform === "darwin") {
    return path.join(home, "Library/Application Support/Google/Chrome");
  } else if (platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/User Data");
  } else {
    return path.join(home, ".config/google-chrome");
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("\n========================================");
  console.log("  LOGIN WITH REGULAR CHROME");
  console.log("========================================\n");

  console.log("This uses your actual Chrome installation.");
  console.log("Cloudflare should not block it.\n");

  const chromePath = findRegularChrome();
  const userDataDir = findChromeUserData();

  console.log("Chrome:", chromePath);
  console.log("User Data:", userDataDir);
  console.log("Extension:", CONFIG.extensionPath);
  console.log("");

  // IMPORTANT: We need to close your regular Chrome first
  console.log("⚠️  IMPORTANT: Close all Chrome windows before continuing!");
  console.log("   (Chrome can only run with one profile at a time)\n");
  console.log("Press ENTER when Chrome is closed...\n");

  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  console.log("Launching Chrome with your profile + extension...\n");

  // Launch with existing user data but add our extension
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: chromePath,
    channel: undefined,
    args: [
      `--disable-extensions-except=${CONFIG.extensionPath}`,
      `--load-extension=${CONFIG.extensionPath}`,
      "--no-first-run",
      "--no-default-browser-check",
      // Don't use automation flags
    ],
    viewport: null,
    ignoreDefaultArgs: ["--enable-automation", "--disable-component-extensions-with-background-pages"],
  });

  const page = context.pages()[0] || (await context.newPage());

  console.log("Navigating to Claude.ai...\n");
  await page.goto(CONFIG.targetUrl);

  console.log("Browser opened with your existing session!");
  console.log("");
  console.log("If you're already logged in, great!");
  console.log("If not, log in now.\n");
  console.log("Once you see your chats, press ENTER here to save and close.\n");

  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  // Copy relevant session data to test profile
  console.log("\nSaving session data to test profile...");

  // Ensure test profile exists
  if (!fs.existsSync(CONFIG.testProfilePath)) {
    fs.mkdirSync(CONFIG.testProfilePath, { recursive: true });
  }

  // Copy cookies from Default profile
  const defaultProfile = path.join(userDataDir, "Default");
  const cookiesSource = path.join(defaultProfile, "Cookies");
  const cookiesDest = path.join(CONFIG.testProfilePath, "Default", "Cookies");

  if (fs.existsSync(cookiesSource)) {
    const destDir = path.dirname(cookiesDest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(cookiesSource, cookiesDest);
    console.log("Copied cookies to test profile.");
  }

  await context.close();

  console.log("\nDone! Your session should now work with the test browser.");
  console.log("Run: npm run test:stealth\n");
}

main().catch(console.error);
