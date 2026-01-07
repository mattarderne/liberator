(function () {
  'use strict';

  // Log initialization
  if (typeof extLog === 'function') {
    extLog('content', 'info', 'Copilot content script loaded', window.location.href);
  }

  /**
   * Container pages that should not be scraped as threads
   */
  const CONTAINER_PAGES = [
    '/discover',      // Discover page
    '/settings',      // Settings page
    '/images',        // Image generator home
    '/notebooks',     // Notebooks listing
  ];

  /**
   * Check if current URL is a container page
   */
  function isContainerPage() {
    const path = window.location.pathname;
    // Home page without chat ID
    if (path === '/' || path === '' || path === '/chat') {
      return true;
    }
    return CONTAINER_PAGES.some(container =>
      path === container || path.startsWith(container + '/')
    );
  }

  /**
   * Determine if this is M365 or personal Copilot
   */
  function getCopilotType() {
    const hostname = window.location.hostname;
    if (hostname === 'm365.cloud.microsoft') return 'm365';
    return 'personal';
  }

  /**
   * Extract thread ID from URL
   * Formats:
   * - https://copilot.microsoft.com/chats/<ID> (personal)
   * - https://m365.cloud.microsoft/chat?chatId=<ID> (M365)
   */
  function deriveThreadId() {
    const url = new URL(window.location.href);
    const type = getCopilotType();

    if (type === 'm365') {
      // M365 uses query param
      const chatId = url.searchParams.get('chatId');
      if (chatId) return `m365-${chatId}`;
      return 'm365-home';
    }

    // Personal Copilot uses path: /chats/<ID>
    const path = url.pathname.split('/').filter(Boolean);
    if (path[0] === 'chats' && path[1]) {
      return path[1];
    }

    return url.pathname || 'copilot-home';
  }

  /**
   * Get the organization from M365 if available
   */
  function getOrganization() {
    // Try to find org name in the page
    const selectors = [
      '[data-testid="org-name"]',
      '[class*="organization"]',
      '[class*="tenant"]',
      '.org-name',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        return el.textContent.trim();
      }
    }

    // Try to get from user profile area
    const profileArea = document.querySelector('[class*="profile"], [class*="account"]');
    if (profileArea) {
      const orgText = profileArea.textContent?.match(/@([a-zA-Z0-9.-]+)/);
      if (orgText) return orgText[1];
    }

    return null;
  }

  /**
   * Get chat title
   */
  function getTitle() {
    const selectors = [
      // Chat title in header
      '[data-testid="chat-title"]',
      'h1[class*="title"]',
      '[class*="conversation-title"]',
      // Active chat in sidebar
      '[aria-current="page"]',
      '[class*="active"] [class*="title"]',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent?.trim();
        if (text && text.length > 2 && text.length < 200 &&
            !text.toLowerCase().includes('copilot') &&
            !text.toLowerCase().includes('microsoft')) {
          return text;
        }
      }
    }

    // Try first user message as title
    const firstUserMsg = document.querySelector('[data-testid*="user"], [class*="user-message"]');
    if (firstUserMsg) {
      const text = firstUserMsg.textContent?.trim();
      if (text && text.length >= 5) {
        const firstLine = text.split('\n')[0].trim();
        if (firstLine.length >= 5 && firstLine.length < 100) {
          return firstLine;
        }
        return text.slice(0, 60) + (text.length > 60 ? '...' : '');
      }
    }

    const type = getCopilotType();
    return type === 'm365' ? 'M365 Copilot Chat' : 'Copilot Chat';
  }

  /**
   * Extract the creation date of the chat
   */
  function getCreatedAt() {
    // Look for timestamp on first message
    const timeEl = document.querySelector('time, [datetime]');
    if (timeEl) {
      return timeEl.getAttribute('datetime') || timeEl.getAttribute('title') || null;
    }

    // Look for date indicators
    const dateText = document.querySelector('[class*="date"], [class*="timestamp"]');
    if (dateText?.textContent) {
      try {
        const parsed = new Date(dateText.textContent.trim());
        if (!isNaN(parsed)) return parsed.toISOString();
      } catch {}
    }

    return null;
  }

  /**
   * Extract messages from conversation
   */
  async function extractMessages() {
    const messages = [];
    const utils = window.threadHubUtils || {};

    // Strategy 1: Look for message containers with role indicators
    const messageContainers = document.querySelectorAll(
      '[data-testid*="message"], [class*="message-container"], [class*="chat-message"]'
    );

    if (messageContainers.length > 0) {
      for (const container of messageContainers) {
        // Scroll into view for lazy content
        if (utils.scrollIntoViewAndWait) {
          await utils.scrollIntoViewAndWait(container, { block: 'center' }, 200);
        }

        // Determine role
        const isUser = container.className?.includes('user') ||
                      container.getAttribute('data-testid')?.includes('user') ||
                      container.querySelector('[class*="user-avatar"]') !== null;

        let text = '';
        if (utils.extractFormattedText) {
          text = utils.extractFormattedText(container);
        } else {
          text = container.innerText?.trim() || '';
        }

        // Clean up code blocks
        if (utils.cleanupCodeBlocks) {
          text = utils.cleanupCodeBlocks(text);
        }

        // Get timestamp if available
        const timeEl = container.querySelector('time, [datetime]');
        const created_at = timeEl?.getAttribute('datetime') || undefined;

        if (text.length >= 5) {
          messages.push({
            role: isUser ? 'user' : 'assistant',
            text: text.slice(0, 10000),
            index: messages.length,
            created_at,
          });
        }
      }
    }

    // Strategy 2: Look for turn-based containers
    if (messages.length === 0) {
      const turns = document.querySelectorAll('[class*="turn"], [class*="exchange"]');
      for (const turn of turns) {
        const userPart = turn.querySelector('[class*="user"], [class*="human"]');
        const assistantPart = turn.querySelector('[class*="assistant"], [class*="bot"], [class*="copilot"]');

        if (userPart) {
          const text = userPart.innerText?.trim() || '';
          if (text.length >= 5) {
            messages.push({ role: 'user', text: text.slice(0, 10000), index: messages.length });
          }
        }

        if (assistantPart) {
          const text = assistantPart.innerText?.trim() || '';
          if (text.length >= 5) {
            messages.push({ role: 'assistant', text: text.slice(0, 10000), index: messages.length });
          }
        }
      }
    }

    // Strategy 3: Generic prose blocks
    if (messages.length === 0) {
      const blocks = document.querySelectorAll('[class*="prose"], [class*="markdown"], main p');
      blocks.forEach((block, index) => {
        const text = block.innerText?.trim() || '';
        if (text.length >= 20) {
          messages.push({
            role: 'unknown',
            text: text.slice(0, 10000),
            index,
          });
        }
      });
    }

    if (typeof extLog === 'function') {
      extLog('content', 'info', `Extracted ${messages.length} messages from Copilot`);
    }

    return messages;
  }

  /**
   * Extract chat list from sidebar
   */
  function extractChatList() {
    const chats = [];
    const seen = new Set();
    const type = getCopilotType();

    // Look for chat links
    const chatLinks = document.querySelectorAll('a[href*="/chats/"], a[href*="chatId="]');

    chatLinks.forEach((link) => {
      const href = link.getAttribute('href');
      let id = null;

      if (type === 'm365') {
        const match = href?.match(/chatId=([^&]+)/);
        if (match) id = `m365-${match[1]}`;
      } else {
        const match = href?.match(/\/chats\/([^/?]+)/);
        if (match) id = match[1];
      }

      if (id && !seen.has(id)) {
        seen.add(id);

        let title = link.textContent?.trim() || '';
        if (!title || title.length < 3) {
          const parent = link.closest('[class*="item"], li');
          title = parent?.textContent?.trim().slice(0, 100) || 'Copilot Chat';
        }

        chats.push({
          id,
          title: title.slice(0, 100),
          href,
        });
      }
    });

    if (typeof extLog === 'function') {
      extLog('content', 'info', `Copilot discovered ${chats.length} chats`);
    }

    return chats;
  }

  /**
   * Extract projects (not typically present in Copilot, but for consistency)
   */
  function extractProjects() {
    return [];
  }

  // Message handler
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type !== 'SCRAPE_THREAD') return;

    // Early exit for container pages
    if (isContainerPage()) {
      if (typeof extLog === 'function') {
        extLog('content', 'info', 'Copilot skipping container page', window.location.pathname);
      }
      sendResponse({
        success: false,
        error: 'container_page',
        message: 'This is a container page, not a conversation',
      });
      return true;
    }

    if (typeof extLog === 'function') {
      extLog('content', 'info', 'Copilot scrape request received');
    }

    // Handle async extraction
    (async () => {
      try {
        const utils = window.threadHubUtils || {};

        // Scroll to load all lazy-loaded messages before extraction
        if (utils.scrollToLoadAllMessages) {
          const scrollResult = await utils.scrollToLoadAllMessages({
            containerSelector: 'main, [role="main"], [class*="chat-container"]',
            messageSelector: '[data-testid*="message"], [class*="message-container"]',
            scrollDelay: 150,
            maxScrollTime: 8000,
          });
          if (typeof extLog === 'function') {
            extLog('content', 'info', 'Copilot scroll-to-load complete', scrollResult);
          }
        }

        const threadId = deriveThreadId();
        const title = getTitle();
        const messages = await extractMessages();
        const chatList = extractChatList();
        const projects = extractProjects();
        const organization = getOrganization();
        const createdAt = getCreatedAt();
        const copilotType = getCopilotType();

        const result = {
          success: true,
          provider_thread_id: threadId,
          title,
          provider_summary: undefined,
          messages,
          url: window.location.href,
          chatList,
          projects,
          // Extended metadata
          organization,
          created_at: createdAt,
          metadata: {
            copilotType,
            organization,
          },
        };

        if (typeof extLog === 'function') {
          extLog('content', 'info', 'Copilot scrape complete', {
            threadId,
            title,
            messageCount: messages.length,
            chatListCount: chatList.length,
            copilotType,
            organization,
          });
        }

        sendResponse(result);
      } catch (err) {
        if (typeof extLog === 'function') {
          extLog('content', 'error', 'Copilot scrape failed', err?.message);
        }
        console.error('Copilot scrape failed', err);
        sendResponse({ success: false, error: err?.message });
      }
    })();

    return true; // Keep channel open for async response
  });

  // Log ready
  if (typeof extLog === 'function') {
    extLog('content', 'info', 'Copilot content script ready, thread:', deriveThreadId());
  }
})();
