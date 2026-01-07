/**
 * Realistic scrape test - runs actual extraction logic against real HTML fixtures
 *
 * Usage: node test/test-scrape.js
 */

import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Test results
const results = { passed: 0, failed: 0, warnings: 0 };

function pass(msg) {
  results.passed++;
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  results.failed++;
  console.log(`  ✗ ${msg}`);
}

function warn(msg) {
  results.warnings++;
  console.log(`  ⚠ ${msg}`);
}

// ============================================================
// CLAUDE EXTRACTION (from content/claude.js)
// ============================================================

function claudeExtract(document, location) {
  // deriveThreadId
  function deriveThreadId() {
    const url = new URL(location.href);
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] === 'chat' && segments[1]) {
      return segments[1];
    }
    return url.pathname || url.href;
  }

  // getTitle
  function getTitle() {
    const selectors = [
      '[data-testid="breadcrumb"]',
      'h1',
      'nav a[aria-current="page"]',
      '[class*="title"]',
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent?.trim()) {
        const text = el.textContent.trim();
        if (text.length > 2 && text.length < 200) {
          return text;
        }
      }
    }
    return document.title || 'Untitled Claude Chat';
  }

  // extractMessages - Claude uses font-user-message and font-claude-response classes
  function extractMessages() {
    const messages = [];
    const userMessages = document.querySelectorAll('[class*="font-user-message"]');
    const assistantMessages = document.querySelectorAll('[class*="font-claude-response"]');

    if (userMessages.length > 0 || assistantMessages.length > 0) {
      const allMessages = [];

      userMessages.forEach((el) => {
        const text = el.textContent?.trim() || '';
        if (text.length >= 5) {
          allMessages.push({ role: 'user', text: text.slice(0, 500), el });
        }
      });

      assistantMessages.forEach((el) => {
        const text = el.textContent?.trim() || '';
        if (text.length >= 5) {
          allMessages.push({ role: 'assistant', text: text.slice(0, 500), el });
        }
      });

      // Sort by DOM position (DOCUMENT_POSITION_FOLLOWING = 4)
      allMessages.sort((a, b) => {
        const pos = a.el.compareDocumentPosition(b.el);
        return pos & 4 ? -1 : 1;
      });

      allMessages.forEach((msg, index) => {
        messages.push({ role: msg.role, text: msg.text, index });
      });
    }

    return messages;
  }

  // extractChatList
  function extractChatList() {
    const chats = [];
    const chatLinks = document.querySelectorAll('nav a[href*="/chat/"], aside a[href*="/chat/"]');
    chatLinks.forEach((link) => {
      const href = link.getAttribute('href');
      const title = link.textContent?.trim() || '';
      const idMatch = href?.match(/\/chat\/([a-f0-9-]+)/i);
      if (idMatch && title) {
        chats.push({ id: idMatch[1], title: title.slice(0, 100), href });
      }
    });
    return chats;
  }

  return {
    threadId: deriveThreadId(),
    title: getTitle(),
    messages: extractMessages(),
    chatList: extractChatList(),
  };
}

// ============================================================
// CHATGPT EXTRACTION (from content/chatgpt.js)
// ============================================================

function chatgptExtract(document, location) {
  function deriveThreadId() {
    const url = new URL(location.href);
    const path = url.pathname.split('/').filter(Boolean);
    if (path[0] === 'c' && path[1]) return path[1];
    if (path.includes('g')) return path.join('-');
    return url.searchParams.get('conversationId') || path[path.length - 1] || url.href;
  }

  function getTitle() {
    const selectors = [
      'nav [data-testid="conversation-item"].bg-token-sidebar-surface-secondary',
      'nav a[class*="active"]',
      '[data-testid="conversation-title"]',
      'h1',
      'nav [data-testid="conversation-item"] .text-sm',
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent?.trim();
        if (text && text.length > 2 && text.length < 200) return text;
      }
    }
    return document.title?.replace(' | ChatGPT', '').trim() || 'Untitled ChatGPT Chat';
  }

  function extractMessages() {
    const messages = [];
    const roleElements = document.querySelectorAll('[data-message-author-role]');

    if (roleElements.length > 0) {
      roleElements.forEach((row, index) => {
        const role = row.getAttribute('data-message-author-role') || 'assistant';
        const text = row.textContent?.trim() || '';
        if (text.length > 2) {
          messages.push({ role: role === 'user' ? 'user' : 'assistant', text: text.slice(0, 500), index });
        }
      });
    }

    if (messages.length === 0) {
      const containers = document.querySelectorAll('[class*="agent-turn"], [class*="user-turn"], [class*="message"]');
      containers.forEach((container, index) => {
        const text = container.textContent?.trim() || '';
        if (text.length < 5) return;
        const isUser = container.classList.toString().includes('user');
        messages.push({ role: isUser ? 'user' : 'assistant', text: text.slice(0, 500), index });
      });
    }

    return messages;
  }

  function extractChatList() {
    const chats = [];
    const chatItems = document.querySelectorAll('nav [data-testid="conversation-item"], nav a[href*="/c/"]');
    chatItems.forEach((item) => {
      const link = item.tagName === 'A' ? item : item.querySelector('a');
      const href = link?.getAttribute('href');
      const title = item.textContent?.trim() || '';
      const idMatch = href?.match(/\/c\/([a-f0-9-]+)/i);
      if (idMatch && title) {
        chats.push({ id: idMatch[1], title: title.slice(0, 100), href });
      }
    });
    return chats;
  }

  return {
    threadId: deriveThreadId(),
    title: getTitle(),
    messages: extractMessages(),
    chatList: extractChatList(),
  };
}

// ============================================================
// GEMINI EXTRACTION (from content/gemini.js)
// ============================================================

function geminiExtract(document, location) {
  function deriveThreadId() {
    const url = new URL(location.href);
    const path = url.pathname.split('/').filter(Boolean);
    if (path[0] === 'app' && path[1]) return path[1];
    if (path[0] === 'mystuff') return 'mystuff';
    return url.searchParams.get('pli') || path[path.length - 1] || url.href;
  }

  function getTitle() {
    const selectors = ['h1', 'header h1', '[class*="conversation-title"]', 'nav button[aria-selected="true"]'];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent?.trim();
        if (text && text.length > 2 && text.length < 200 && !text.includes('Gemini')) return text;
      }
    }
    return document.title?.replace(' - Gemini', '').trim() || 'Untitled Gemini Chat';
  }

  // Gemini uses user-query-container for user messages
  function extractMessages() {
    const messages = [];
    const userQueries = document.querySelectorAll('[class*="user-query-container"], [class*="query-content"]');
    const assistantResponses = document.querySelectorAll('[class*="model-response-text"], [class*="response-content"], main [data-md]');

    if (userQueries.length > 0 || assistantResponses.length > 0) {
      const allMessages = [];

      userQueries.forEach((el) => {
        const text = el.textContent?.trim() || '';
        if (text.length >= 5) {
          allMessages.push({ role: 'user', text: text.slice(0, 500), el });
        }
      });

      assistantResponses.forEach((el) => {
        const text = el.textContent?.trim() || '';
        if (text.length >= 5) {
          if (el.closest('[class*="user-query"]')) return;
          allMessages.push({ role: 'assistant', text: text.slice(0, 500), el });
        }
      });

      // Sort by DOM position (DOCUMENT_POSITION_FOLLOWING = 4)
      allMessages.sort((a, b) => {
        const pos = a.el.compareDocumentPosition(b.el);
        return pos & 4 ? -1 : 1;
      });

      allMessages.forEach((msg, index) => {
        messages.push({ role: msg.role, text: msg.text, index });
      });
    }

    return messages;
  }

  function extractChatList() {
    const chats = [];

    // Strategy 1: Look for conversation-title elements (Angular Material)
    const titleElements = document.querySelectorAll('.conversation-title, [class*="conversation-title"]');
    titleElements.forEach((el, index) => {
      const title = el.textContent?.trim() || '';
      if (title && title.length > 2 && title.length < 100) {
        chats.push({ id: `gemini-${index}`, title: title.slice(0, 100) });
      }
    });

    // Strategy 2: Look for links to /app/<id>
    if (chats.length === 0) {
      const appLinks = document.querySelectorAll('a[href*="/app/"]');
      appLinks.forEach((link) => {
        const href = link.getAttribute('href');
        const idMatch = href?.match(/\/app\/([a-f0-9-]+)/i);
        if (idMatch) {
          const title = link.textContent?.trim() || '';
          if (title && title.length > 2 && title.length < 100) {
            chats.push({ id: idMatch[1], title: title.slice(0, 100), href });
          }
        }
      });
    }

    // Deduplicate
    const seen = new Set();
    return chats.filter((chat) => {
      if (seen.has(chat.title)) return false;
      seen.add(chat.title);
      return true;
    });
  }

  return {
    threadId: deriveThreadId(),
    title: getTitle(),
    messages: extractMessages(),
    chatList: extractChatList(),
  };
}

// ============================================================
// GROK EXTRACTION (from content/grok.js)
// ============================================================

function grokExtract(document, location) {
  function deriveThreadId() {
    const url = new URL(location.href);
    const path = url.pathname.split('/').filter(Boolean);
    const hash = url.hash.replace('#', '');
    if (hash && hash !== 'private') return hash;
    if (hash === 'private') return 'private-' + Date.now();
    if (path[0] === 'highlights' && path[1]) return `highlight-${path[1]}`;
    if (path[0] === 'trends' && path[1]) return `trend-${path[1]}`;
    return 'grok-home';
  }

  function getTitle() {
    const selectors = ['h1', '[class*="title"]', 'nav [aria-current="page"]'];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent?.trim();
        if (text && text.length > 2 && text.length < 200 && !text.toLowerCase().includes('grok')) return text;
      }
    }
    return document.title?.replace(' | Grok', '').trim() || 'Grok Conversation';
  }

  // Grok uses message-bubble class - user messages don't have bg-surface-l1
  function extractMessages() {
    const messages = [];
    const bubbles = document.querySelectorAll('[class*="message-bubble"]');

    if (bubbles.length > 0) {
      bubbles.forEach((bubble, index) => {
        const text = bubble.textContent?.trim() || '';
        if (text.length < 5) return;
        const classes = bubble.className || '';
        const isAssistant = classes.includes('bg-surface-l1');
        messages.push({ role: isAssistant ? 'assistant' : 'user', text: text.slice(0, 500), index });
      });
    }

    return messages;
  }

  function extractChatList() {
    const items = [];
    const cards = document.querySelectorAll('[class*="card"], [class*="highlight"], [class*="trend"], a[href*="/highlights/"], a[href*="/trends/"]');
    cards.forEach((card) => {
      const title = card.textContent?.trim()?.slice(0, 100) || '';
      const href = card.getAttribute('href') || card.querySelector('a')?.getAttribute('href');
      if (title && title.length > 2) {
        let id = 'grok-item';
        if (href) {
          const match = href.match(/\/(highlights|trends)\/([^/]+)/);
          id = match?.[2] || id;
        }
        items.push({ id, title, href });
      }
    });

    const seen = new Set();
    return items.filter((item) => {
      if (seen.has(item.title)) return false;
      seen.add(item.title);
      return true;
    });
  }

  return {
    threadId: deriveThreadId(),
    title: getTitle(),
    messages: extractMessages(),
    chatList: extractChatList(),
  };
}

// ============================================================
// TEST RUNNER
// ============================================================

async function runTests() {
  console.log('\n🔬 REALISTIC SCRAPE TESTS\n');
  console.log('Testing content script selectors against real HTML fixtures\n');

  const fixtures = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.html'));

  if (fixtures.length === 0) {
    console.log('No fixtures found in test/fixtures/');
    console.log('Use the 💾 button in the extension to save real page HTML');
    process.exit(1);
  }

  for (const fixture of fixtures) {
    const provider = fixture.split('-')[0];
    const filePath = path.join(FIXTURES_DIR, fixture);
    const html = fs.readFileSync(filePath, 'utf-8');

    // Extract source URL from comment
    const urlMatch = html.match(/<!-- Source: (.+?) -->/);
    const sourceUrl = urlMatch ? urlMatch[1] : `https://${provider}.example.com/chat/test-123`;

    console.log(`\n${provider.toUpperCase()}: ${fixture}`);
    console.log('─'.repeat(50));

    try {
      const dom = new JSDOM(html, { url: sourceUrl });
      const { document } = dom.window;
      const location = dom.window.location;

      let result;
      switch (provider) {
        case 'claude':
          result = claudeExtract(document, location);
          break;
        case 'chatgpt':
          result = chatgptExtract(document, location);
          break;
        case 'gemini':
          result = geminiExtract(document, location);
          break;
        case 'grok':
          result = grokExtract(document, location);
          break;
        default:
          warn(`Unknown provider: ${provider}`);
          continue;
      }

      // Validate results
      if (result.threadId && result.threadId !== 'undefined' && result.threadId.length > 0) {
        pass(`Thread ID: ${result.threadId}`);
      } else {
        fail(`Thread ID: ${result.threadId || '(empty)'}`);
      }

      if (result.title && result.title.length > 2 && !result.title.includes('Untitled')) {
        pass(`Title: "${result.title.slice(0, 50)}${result.title.length > 50 ? '...' : ''}"`);
      } else {
        warn(`Title: "${result.title}" (may be fallback)`);
      }

      if (result.messages.length > 0) {
        const userMsgs = result.messages.filter(m => m.role === 'user').length;
        const asstMsgs = result.messages.filter(m => m.role === 'assistant').length;
        pass(`Messages: ${result.messages.length} total (${userMsgs} user, ${asstMsgs} assistant)`);

        // Show first message preview
        const preview = result.messages[0].text.slice(0, 80).replace(/\n/g, ' ');
        console.log(`    First: [${result.messages[0].role}] "${preview}..."`);
      } else {
        fail('Messages: 0 (selectors may not match)');
      }

      if (result.chatList.length > 0) {
        pass(`Chat list: ${result.chatList.length} discovered`);
        console.log(`    Sample: "${result.chatList[0].title.slice(0, 40)}"`);
      } else {
        warn('Chat list: 0 (sidebar may not be visible or selectors need update)');
      }

    } catch (err) {
      fail(`Error processing ${fixture}: ${err.message}`);
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('SCRAPE TEST RESULTS');
  console.log('═'.repeat(50));
  console.log(`  ✓ Passed:   ${results.passed}`);
  console.log(`  ⚠ Warnings: ${results.warnings}`);
  console.log(`  ✗ Failed:   ${results.failed}`);

  if (results.failed > 0) {
    console.log('\n⚠️  Some selectors may need updating for current site structure');
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests();
