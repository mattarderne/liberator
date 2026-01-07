#!/usr/bin/env node
/**
 * Claude Code Sync - Native Messaging Host
 *
 * Watches ~/.claude/projects/ for new/modified session files
 * and sends them to the Thread Hub extension for import.
 *
 * Usage:
 *   node claude-code-sync.js [--watch] [--once]
 *
 * Install:
 *   1. npm install in this directory
 *   2. Run install-host.sh to register with Chrome
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Claude Code paths
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const HISTORY_FILE = path.join(CLAUDE_DIR, 'history.jsonl');

// State tracking
let lastSyncTime = null;
let syncedFiles = new Map(); // path -> mtime

/**
 * Read native messaging input from stdin
 */
function readMessage() {
  return new Promise((resolve) => {
    let data = Buffer.alloc(0);

    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data = Buffer.concat([data, chunk]);
      }
    });

    process.stdin.on('end', () => {
      if (data.length < 4) {
        resolve(null);
        return;
      }
      const length = data.readUInt32LE(0);
      const message = data.slice(4, 4 + length).toString('utf8');
      try {
        resolve(JSON.parse(message));
      } catch (e) {
        resolve(null);
      }
    });
  });
}

/**
 * Send native messaging output to stdout
 */
function sendMessage(message) {
  const json = JSON.stringify(message);
  const buffer = Buffer.alloc(4 + json.length);
  buffer.writeUInt32LE(json.length, 0);
  buffer.write(json, 4);
  process.stdout.write(buffer);
}

/**
 * Find all JSONL session files in ~/.claude/projects/
 */
function findSessionFiles() {
  const files = [];

  if (!fs.existsSync(PROJECTS_DIR)) {
    return files;
  }

  // Iterate project folders
  const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(PROJECTS_DIR, d.name));

  for (const projectDir of projectDirs) {
    try {
      const sessionFiles = fs.readdirSync(projectDir)
        .filter(f => f.endsWith('.jsonl') && !f.startsWith('.'))
        .map(f => path.join(projectDir, f));

      for (const file of sessionFiles) {
        const stats = fs.statSync(file);
        files.push({
          path: file,
          mtime: stats.mtime.getTime(),
          size: stats.size,
        });
      }
    } catch (e) {
      // Skip inaccessible directories
    }
  }

  return files;
}

/**
 * Read and parse a session file
 */
function readSessionFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { path: filePath, content };
  } catch (e) {
    return null;
  }
}

/**
 * Get files that are new or modified since last sync
 */
function getChangedFiles(files) {
  const changed = [];

  for (const file of files) {
    const lastMtime = syncedFiles.get(file.path);
    if (!lastMtime || file.mtime > lastMtime) {
      changed.push(file);
    }
  }

  return changed;
}

/**
 * Perform a sync - find changed files and send to extension
 */
function performSync(force = false) {
  const allFiles = findSessionFiles();
  const changedFiles = force ? allFiles : getChangedFiles(allFiles);

  if (changedFiles.length === 0) {
    return { type: 'sync_result', sessions: [], unchanged: allFiles.length };
  }

  const sessions = [];
  for (const file of changedFiles) {
    const data = readSessionFile(file.path);
    if (data) {
      sessions.push(data);
      syncedFiles.set(file.path, file.mtime);
    }
  }

  lastSyncTime = Date.now();

  return {
    type: 'sync_result',
    sessions,
    total: allFiles.length,
    synced: sessions.length,
    timestamp: lastSyncTime,
  };
}

/**
 * Get sync status
 */
function getStatus() {
  const allFiles = findSessionFiles();
  const projectDirs = new Set();

  for (const file of allFiles) {
    const parts = file.path.split(path.sep);
    const projectIdx = parts.indexOf('projects');
    if (projectIdx >= 0 && parts[projectIdx + 1]) {
      projectDirs.add(parts[projectIdx + 1]);
    }
  }

  return {
    type: 'status',
    claudeDir: CLAUDE_DIR,
    claudeDirExists: fs.existsSync(CLAUDE_DIR),
    projectsDir: PROJECTS_DIR,
    projectsDirExists: fs.existsSync(PROJECTS_DIR),
    totalFiles: allFiles.length,
    totalProjects: projectDirs.size,
    lastSyncTime,
    syncedFilesCount: syncedFiles.size,
  };
}

/**
 * Main entry point - handle messages from extension
 */
async function main() {
  // Check for command line args
  const args = process.argv.slice(2);

  if (args.includes('--status')) {
    console.log(JSON.stringify(getStatus(), null, 2));
    process.exit(0);
  }

  if (args.includes('--once')) {
    const result = performSync(true);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (args.includes('--list')) {
    const files = findSessionFiles();
    console.log(JSON.stringify(files, null, 2));
    process.exit(0);
  }

  // Native messaging mode - read from stdin
  const message = await readMessage();

  if (!message) {
    sendMessage({ type: 'error', error: 'No message received' });
    process.exit(1);
  }

  let response;

  switch (message.type) {
    case 'status':
      response = getStatus();
      break;

    case 'sync':
      response = performSync(message.force || false);
      break;

    case 'ping':
      response = { type: 'pong', timestamp: Date.now() };
      break;

    default:
      response = { type: 'error', error: `Unknown message type: ${message.type}` };
  }

  sendMessage(response);
}

main().catch(err => {
  sendMessage({ type: 'error', error: err.message });
  process.exit(1);
});
