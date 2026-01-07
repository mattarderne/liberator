#!/usr/bin/env node
/**
 * Extension File Watcher
 *
 * Watches for changes and notifies you to reload.
 * Run: npm run dev
 */

const chokidar = require('chokidar');
const path = require('path');
const { exec } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// Files to watch
const WATCH_PATTERNS = [
  'manifest.json',
  'background.js',
  'storage.js',
  'openai.js',
  'content/**/*.js',
  'shared/**/*.js',
  'ui/**/*.js',
  'ui/**/*.html',
  'ui/**/*.css',
  'providers/**/*.js',
];

// Debounce reload notifications
let lastChange = 0;
const DEBOUNCE_MS = 500;

console.log('\n🔄 Extension Dev Watcher');
console.log('========================\n');
console.log('Watching for changes...');
console.log('Press Ctrl+C to stop\n');

// Open extensions page on start
console.log('💡 Tip: Keep chrome://extensions open and click the reload ↻ button\n');

const watcher = chokidar.watch(WATCH_PATTERNS, {
  cwd: ROOT,
  ignoreInitial: true,
  ignored: [
    '**/node_modules/**',
    '**/.git/**',
    '**/chrome/**',
    '**/test-reports/**',
    '**/.test-profile*/**',
  ],
});

watcher.on('change', (filePath) => {
  const now = Date.now();
  if (now - lastChange < DEBOUNCE_MS) return;
  lastChange = now;

  const time = new Date().toLocaleTimeString();
  console.log(`\n📝 [${time}] Changed: ${filePath}`);
  console.log('   → Reload extension in Chrome (click ↻ on chrome://extensions)');

  // Beep to notify (optional)
  process.stdout.write('\x07');
});

watcher.on('add', (filePath) => {
  const time = new Date().toLocaleTimeString();
  console.log(`\n➕ [${time}] Added: ${filePath}`);
  console.log('   → Reload extension in Chrome');
  process.stdout.write('\x07');
});

watcher.on('unlink', (filePath) => {
  const time = new Date().toLocaleTimeString();
  console.log(`\n➖ [${time}] Removed: ${filePath}`);
  console.log('   → Reload extension in Chrome');
  process.stdout.write('\x07');
});

watcher.on('error', (error) => {
  console.error('Watcher error:', error);
});

// Keep running
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopped watching');
  watcher.close();
  process.exit(0);
});
