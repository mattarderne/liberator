(function () {
  'use strict';

  // Log initialization
  if (typeof extLog === 'function') {
    extLog('content', 'info', 'ChatGPT content script loaded', window.location.href);
  }

  /**
   * Container pages that should not be scraped as threads
   * These are listing/navigation pages, not actual conversations
   */
  const CONTAINER_PAGES = [
    '/library',       // Saved artifacts/items library
    '/gpts',          // GPT store
    '/explore',       // Explore page
    '/g/',            // GPT listing (without full path)
    '/auth',          // Auth pages
  ];

  /**
   * Check if current URL is a container page (not a real conversation)
   */
  function isContainerPage() {
    const path = window.location.pathname;
    // Exact matches or prefix matches for container pages
    return CONTAINER_PAGES.some(container => {
      if (container.endsWith('/')) {
        // Prefix match (e.g., /g/ matches /g but not /g/something/c/...)
        return path === container.slice(0, -1) || (path.startsWith(container) && !path.includes('/c/'));
      }
      return path === container || path.startsWith(container + '/');
    }) || path === '/' || path === '';
  }

  /**
   * Extract thread ID from URL
   * Formats:
   * - https://chatgpt.com/c/<UUID> (standard chat)
   * - https://chatgpt.com/codex/<UUID> (Codex session)
   * - https://chatgpt.com/g/g-p-<id>/project (GPT project)
   */
  function deriveThreadId() {
    const url = new URL(window.location.href);
    const path = url.pathname.split('/').filter(Boolean);

    // Standard chat: /c/<uuid>
    if (path[0] === 'c' && path[1]) {
      return path[1];
    }

    // Codex session: /codex/<uuid> or /codex/tasks/<uuid>
    if (path[0] === 'codex') {
      if (path[1] === 'tasks' && path[2]) {
        return `codex-task-${path[2]}`;
      }
      if (path[1]) {
        return `codex-${path[1]}`;
      }
      return 'codex-main';
    }

    // Project chat: /g/g-p-<id>/project or similar
    if (path.includes('g')) {
      return path.join('-');
    }

    return url.searchParams.get('conversationId') || path[path.length - 1] || url.href;
  }

  /**
   * Get the type of ChatGPT page we're on
   */
  function getPageType() {
    const url = new URL(window.location.href);
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] === 'codex') return 'codex';
    if (segments.includes('g')) return 'gpt';
    return 'chat';
  }

  /**
   * Extract GitHub repository info from Codex sessions
   * Codex shows the connected repo in the UI
   */
  function getGithubRepo() {
    const pageType = getPageType();
    if (pageType !== 'codex') return null;

    // Look for repo name in Codex UI
    const selectors = [
      // Repo selector/display
      '[data-testid*="repo"]',
      '[class*="repository"]',
      '[class*="repo-name"]',
      // GitHub icon with text
      'a[href*="github.com"]',
      // Header area where repo is shown
      '[class*="codex"] [class*="header"] span',
      '[class*="workspace"] [class*="title"]',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        // Check for GitHub link
        const href = el.getAttribute('href');
        if (href?.includes('github.com')) {
          const match = href.match(/github\.com\/([^\/]+\/[^\/]+)/);
          if (match) return match[1];
        }

        // Check text content for repo pattern (owner/repo)
        const text = el.textContent?.trim();
        if (text?.match(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/)) {
          return text;
        }
      }
    }

    // Also check for repo in page title or breadcrumb
    const breadcrumb = document.querySelector('[class*="breadcrumb"]');
    if (breadcrumb) {
      const text = breadcrumb.textContent?.trim();
      const match = text?.match(/([a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)/);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Extract organization from ChatGPT (Teams/Enterprise)
   */
  function getOrganization() {
    // Look for org name in UI (ChatGPT Teams/Enterprise)
    const selectors = [
      '[data-testid*="workspace"]',
      '[class*="workspace-name"]',
      '[class*="org-name"]',
      '[class*="team-name"]',
      // Profile area
      '.profile-container [class*="org"]',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        const text = el.textContent.trim();
        // Filter out generic labels
        if (text && text.length > 1 && text.length < 100 &&
            !text.toLowerCase().includes('personal') &&
            !text.toLowerCase().includes('free')) {
          return text;
        }
      }
    }

    return null;
  }

  /**
   * Extract the creation date of the chat
   */
  function getCreatedAt() {
    // Try to find the timestamp of the first message
    const firstTurn = document.querySelector('[data-testid^="conversation-turn-"]');
    if (firstTurn) {
      const timeEl = firstTurn.querySelector('time');
      if (timeEl) {
        return timeEl.getAttribute('datetime') || timeEl.getAttribute('title') || null;
      }
    }

    // Look for any time element
    const timeEl = document.querySelector('time[datetime]');
    if (timeEl) {
      return timeEl.getAttribute('datetime');
    }

    return null;
  }

  /**
   * Get chat title
   */
  function getTitle() {
    // Try multiple selectors
    const selectors = [
      // Sidebar active conversation
      'nav [data-testid="conversation-item"].bg-token-sidebar-surface-secondary',
      'nav a[class*="active"]',
      // Page title element
      '[data-testid="conversation-title"]',
      'h1',
      // Fallback to first sidebar item text
      'nav [data-testid="conversation-item"] .text-sm',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent?.trim();
        if (text && text.length > 2 && text.length < 200) {
          return text;
        }
      }
    }

    return document.title?.replace(' | ChatGPT', '').trim() || 'Untitled ChatGPT Chat';
  }

  /**
   * Extract messages from the conversation with improved scraping
   * Uses patterns from chat-export for more reliable extraction
   */
  async function extractMessages() {
    const messages = [];
    const utils = window.threadHubUtils || {};

    // Strategy 1: Use conversation-turn containers (most reliable)
    const turns = document.querySelectorAll('[data-testid^="conversation-turn-"]');

    // Debug logging for message extraction
    if (typeof extLog === 'function') {
      const roleElements = document.querySelectorAll('[data-message-author-role]').length;
      const proseBlocks = document.querySelectorAll('[class*="prose"], [class*="markdown"]').length;
      extLog('content', 'log', `ChatGPT extraction: turns=${turns.length}, roleElements=${roleElements}, proseBlocks=${proseBlocks}`);
    }

    if (turns.length > 0) {
      for (const turn of turns) {
        const messageDiv = turn.querySelector('[data-message-author-role]');
        if (!messageDiv) continue;

        const role = messageDiv.getAttribute('data-message-author-role');
        if (!role) continue;

        // Scroll into view to ensure lazy-loaded content is available
        if (utils.scrollIntoViewAndWait) {
          const block = role === 'assistant' ? 'end' : 'start';
          await utils.scrollIntoViewAndWait(turn, { block }, 300);
        }

        // Find content container and clone to avoid mutations
        const contentElement = turn.querySelector('.whitespace-pre-wrap, .markdown');
        if (!contentElement) continue;

        const contentClone = contentElement.cloneNode(true);

        // Remove source citations
        if (utils.removeSourceCitations) {
          utils.removeSourceCitations(contentClone);
        }

        // Extract formatted text with markdown preserved
        let text = '';
        if (utils.extractFormattedText) {
          text = utils.extractFormattedText(contentClone);
        } else {
          text = contentClone.innerText?.trim() || '';
        }

        // Clean up code blocks
        if (utils.cleanupCodeBlocks) {
          text = utils.cleanupCodeBlocks(text);
        }

        // Handle images
        const images = turn.querySelectorAll('img');
        let imageContent = '';
        for (const image of images) {
          // Skip favicon images used for sources
          if (image.src?.includes('google.com/s2/favicons')) continue;
          imageContent += `\n[Image: ${image.alt || 'uploaded image'}]\n`;
        }

        const timeEl = turn.querySelector('time');
        const created = timeEl?.getAttribute('datetime') || undefined;

        if (text.length > 2 || imageContent) {
          messages.push({
            role: role === 'user' ? 'user' : 'assistant',
            text: (imageContent + text).slice(0, 10000),
            created_at: created,
            index: messages.length,
          });
        }
      }
    }

    // Strategy 2: Fallback to data-message-author-role without turn containers
    if (messages.length === 0) {
      const roleElements = document.querySelectorAll('[data-message-author-role]');

      roleElements.forEach((row, index) => {
        const role = row.getAttribute('data-message-author-role') || 'assistant';

        // Clone and extract formatted text
        const clone = row.cloneNode(true);
        if (utils.removeSourceCitations) {
          utils.removeSourceCitations(clone);
        }

        const text = utils.extractFormattedText ?
          utils.extractFormattedText(clone) :
          row.innerText?.trim() || '';

        const timeEl = row.querySelector('time');
        const created = timeEl?.getAttribute('datetime') || undefined;

        if (text.length > 2) {
          messages.push({
            role: role === 'user' ? 'user' : 'assistant',
            text: text.slice(0, 10000),
            created_at: created,
            index,
          });
        }
      });
    }

    // Strategy 3: Fallback - main content area text blocks
    if (messages.length === 0) {
      const mainContent = document.querySelector('main') || document.body;
      const textBlocks = mainContent.querySelectorAll('[class*="prose"], [class*="markdown"]');

      textBlocks.forEach((block, index) => {
        const text = block.innerText?.trim() || '';
        if (text.length > 20) {
          messages.push({
            role: 'unknown',
            text: text.slice(0, 10000),
            index,
          });
        }
      });
    }

    if (typeof extLog === 'function') {
      extLog('content', 'info', `Extracted ${messages.length} messages from ChatGPT`);
    }

    return messages;
  }

  /**
   * Extract projects from ChatGPT
   * ChatGPT Projects appear as /g/g-p-<uuid> URLs
   */
  function extractProjects() {
    const projects = [];
    const seen = new Set();

    // Look for project links in sidebar or UI
    // ChatGPT projects are GPTs with /g/g-p- prefix
    const projectLinks = document.querySelectorAll('a[href*="/g/g-p-"], a[href*="/project/"]');

    projectLinks.forEach((link) => {
      const href = link.getAttribute('href');

      // Extract project ID
      const projectMatch = href?.match(/\/g\/(g-p-[a-zA-Z0-9]+)/i) ||
                          href?.match(/\/project\/([a-f0-9-]+)/i);

      if (projectMatch && !seen.has(projectMatch[1])) {
        seen.add(projectMatch[1]);

        // Get project name from link or nearby elements
        let name = link.textContent?.trim() || '';
        if (!name || name.length < 2) {
          const parent = link.closest('[class*="item"]') || link.parentElement;
          name = parent?.textContent?.trim().slice(0, 100) || 'Unnamed Project';
        }

        projects.push({
          provider_project_id: projectMatch[1],
          name: name.slice(0, 100),
          href,
          type: 'gpt_project',
        });
      }
    });

    // Also check for Codex which acts like a project
    const codexLink = document.querySelector('a[href*="/codex"]');
    if (codexLink && !seen.has('codex-main')) {
      seen.add('codex-main');
      projects.push({
        provider_project_id: 'codex-main',
        name: 'Codex',
        href: '/codex',
        type: 'codex',
      });
    }

    if (typeof extLog === 'function') {
      extLog('content', 'info', `ChatGPT discovered ${projects.length} projects`);
    }

    return projects;
  }

  /**
   * Extract sidebar conversation list
   */
  function extractChatList() {
    const chats = [];
    const seen = new Set();

    // Look for conversation items in sidebar - include chats and codex
    // ChatGPT's sidebar structure changes frequently, try multiple selectors
    const sidebarSelectors = [
      'nav [data-testid="conversation-item"]',
      'nav a[href*="/c/"]',
      'nav a[href*="/codex/"]',
      'a[href*="/g/"]',
      // Fallback selectors for newer ChatGPT versions
      '[data-testid*="conversation"] a[href*="/c/"]',
      'aside a[href*="/c/"]',
      '[role="navigation"] a[href*="/c/"]',
    ];

    const chatItems = document.querySelectorAll(sidebarSelectors.join(', '));

    // Debug logging for troubleshooting
    if (typeof extLog === 'function') {
      extLog('content', 'log', `ChatGPT sidebar: found ${chatItems.length} items`);
      if (chatItems.length === 0) {
        // Log what we can find to help debug
        const hasNav = !!document.querySelector('nav');
        const hasAside = !!document.querySelector('aside');
        const anyLinks = document.querySelectorAll('a[href*="/c/"]').length;
        extLog('content', 'log', `ChatGPT DOM: nav=${hasNav}, aside=${hasAside}, /c/ links=${anyLinks}`);
      }
    }

    chatItems.forEach((item) => {
      const link = item.tagName === 'A' ? item : item.querySelector('a');
      const href = link?.getAttribute('href');
      const title = item.textContent?.trim() || '';

      // Match different URL patterns
      const chatMatch = href?.match(/\/c\/([a-f0-9-]+)/i);
      const codexMatch = href?.match(/\/codex\/(?:tasks\/)?([a-f0-9-]+)/i);
      const gptMatch = href?.match(/\/g\/(g-[a-zA-Z0-9-]+)/i);

      let id = null;
      let type = 'chat';

      if (chatMatch) {
        id = chatMatch[1];
        type = 'chat';
      } else if (codexMatch) {
        id = `codex-${codexMatch[1]}`;
        type = 'codex';
      } else if (gptMatch) {
        id = gptMatch[1];
        type = 'gpt';
      }

      if (id && title && !seen.has(id)) {
        seen.add(id);
        chats.push({
          id,
          title: title.slice(0, 100),
          href,
          type,
        });
      }
    });

    return chats;
  }

  // Prevent concurrent scrapes - use promise to allow waiting
  let scrapeInProgress = false;
  let scrapePromise = null;
  let lastScrapeResult = null;
  let lastScrapeTime = 0;

  // Message handler
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type !== 'SCRAPE_THREAD') return;

    // Early exit for container pages (library, explore, etc.)
    if (isContainerPage()) {
      if (typeof extLog === 'function') {
        extLog('content', 'info', 'ChatGPT skipping container page', window.location.pathname);
      }
      sendResponse({
        success: false,
        error: 'container_page',
        message: 'This is a container page, not a conversation',
      });
      return true;
    }

    // If scrape is in progress, wait for it to complete
    if (scrapeInProgress && scrapePromise) {
      if (typeof extLog === 'function') {
        extLog('content', 'log', 'ChatGPT scrape in progress, waiting for result...');
      }
      scrapePromise.then((result) => {
        sendResponse(result);
      }).catch((err) => {
        sendResponse({ success: false, error: err?.message || 'scrape failed' });
      });
      return true;
    }

    // If we have a very recent result (within 2s), return it immediately
    if (lastScrapeResult && Date.now() - lastScrapeTime < 2000) {
      if (typeof extLog === 'function') {
        extLog('content', 'log', 'ChatGPT returning cached result');
      }
      sendResponse(lastScrapeResult);
      return true;
    }

    scrapeInProgress = true;

    if (typeof extLog === 'function') {
      extLog('content', 'info', 'ChatGPT scrape request received');
    }

    // Handle async extraction - store promise so others can wait
    scrapePromise = (async () => {
      try {
        const utils = window.threadHubUtils || {};

        // Scroll to load all lazy-loaded messages before extraction
        if (utils.scrollToLoadAllMessages) {
          const scrollResult = await utils.scrollToLoadAllMessages({
            containerSelector: 'main, [role="main"]',
            messageSelector: '[data-testid^="conversation-turn-"]',
            scrollDelay: 150,
            maxScrollTime: 8000,
          });
          if (typeof extLog === 'function') {
            extLog('content', 'info', 'ChatGPT scroll-to-load complete', scrollResult);
          }
        }

        const threadId = deriveThreadId();
        const title = getTitle();
        const messages = await extractMessages();
        const chatList = extractChatList();
        const projects = extractProjects();

        const pageType = getPageType();
        const githubRepo = getGithubRepo();
        const organization = getOrganization();
        const createdAt = getCreatedAt();

        const result = {
          success: true,
          provider_thread_id: threadId,
          title,
          provider_summary: document.querySelector('[data-testid="conversation-title"]')?.textContent?.trim(),
          messages,
          url: window.location.href,
          chatList,
          projects,
          pageType,
          // Extended metadata
          github_repo: githubRepo,
          organization,
          created_at: createdAt,
          metadata: {
            pageType,
            githubRepo,
            organization,
          },
        };

        if (typeof extLog === 'function') {
          extLog('content', 'info', 'ChatGPT scrape complete', {
            threadId,
            title,
            githubRepo,
            organization,
            messageCount: messages.length,
            chatListCount: chatList.length,
          });
        }

        // Cache result
        lastScrapeResult = result;
        lastScrapeTime = Date.now();
        scrapeInProgress = false;

        sendResponse(result);
        return result;
      } catch (err) {
        if (typeof extLog === 'function') {
          extLog('content', 'error', 'ChatGPT scrape failed', err?.message);
        }
        console.error('ChatGPT scrape failed', err);
        scrapeInProgress = false;
        const errorResult = { success: false, error: err?.message };
        sendResponse(errorResult);
        return errorResult;
      }
    })();

    return true; // Keep channel open for async response
  });

  // Log ready
  if (typeof extLog === 'function') {
    extLog('content', 'info', 'ChatGPT content script ready, thread:', deriveThreadId());
  }
})();
