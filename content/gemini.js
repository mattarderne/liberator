(function () {
  'use strict';

  // Log initialization
  if (typeof extLog === 'function') {
    extLog('content', 'info', 'Gemini content script loaded', window.location.href);
  }

  /**
   * Container pages that should not be scraped as threads
   */
  const CONTAINER_PAGES = [
    '/mystuff',       // My Stuff listing page
    '/gems',          // Gems listing page
    '/extensions',    // Extensions page
    '/settings',      // Settings page
  ];

  /**
   * Check if current URL is a container page
   */
  function isContainerPage() {
    const path = window.location.pathname;
    return CONTAINER_PAGES.some(container =>
      path === container || path.startsWith(container + '/')
    ) || path === '/' || path === '';
  }

  /**
   * Extract thread ID from URL
   * Format: https://gemini.google.com/app/<CHAT_ID>
   */
  function deriveThreadId() {
    const url = new URL(window.location.href);
    const path = url.pathname.split('/').filter(Boolean);

    // /app/<chat_id> format
    if (path[0] === 'app' && path[1]) {
      return path[1];
    }

    // /mystuff page
    if (path[0] === 'mystuff') {
      return 'mystuff';
    }

    return url.searchParams.get('pli') || path[path.length - 1] || url.href;
  }

  /**
   * Extract title from a chat link element (used by both getTitle and extractChatList)
   */
  function extractTitleFromLink(link) {
    // Try multiple strategies to find the title

    // Strategy 1: Direct text content of link (excluding hidden/icon elements)
    let title = '';
    const textNodes = [];
    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim();
      if (text && text.length > 2) {
        textNodes.push(text);
      }
    }
    if (textNodes.length > 0) {
      title = textNodes.join(' ').trim();
    }

    // Strategy 2: Look for specific title elements inside the link
    if (!title || title.length < 3) {
      const titleEl = link.querySelector('[class*="title"], [class*="name"], span, p');
      if (titleEl) {
        title = titleEl.textContent?.trim() || '';
      }
    }

    // Strategy 3: aria-label attribute
    if (!title || title.length < 3) {
      title = link.getAttribute('aria-label') || '';
    }

    // Strategy 4: title attribute
    if (!title || title.length < 3) {
      title = link.getAttribute('title') || '';
    }

    // Strategy 5: Look at parent container
    if (!title || title.length < 3) {
      const parent = link.closest('li, [role="listitem"], [class*="item"], [class*="conversation"], [class*="chat"]');
      if (parent) {
        // Look for title element in parent
        const parentTitle = parent.querySelector('[class*="title"], [class*="name"]');
        if (parentTitle && !parentTitle.contains(link)) {
          title = parentTitle.textContent?.trim() || '';
        }
        // Fallback to parent's text
        if (!title || title.length < 3) {
          title = parent.textContent?.trim().slice(0, 100) || '';
        }
      }
    }

    // Clean up title - remove common UI text
    if (title) {
      title = title.replace(/^(Chat|Conversation|New chat)\s*/i, '').trim();
    }

    return title;
  }

  /**
   * Get chat title from page
   */
  function getTitle() {
    // Strategy 1: Look for the currently selected/active chat in the sidebar
    const activeSelectors = [
      // Active conversation in sidebar (various possible states)
      'a[aria-current="page"]',
      'a[aria-selected="true"]',
      '[class*="selected"] a[href*="/app/"]',
      '[class*="active"] a[href*="/app/"]',
      'nav [aria-current="page"]',
    ];

    for (const selector of activeSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        const title = extractTitleFromLink(el);
        if (title && title.length > 2 && title.length < 200) {
          return title;
        }
      }
    }

    // Strategy 2: Look for title in the chat header area
    const headerSelectors = [
      // Conversation heading
      'main h1',
      '[class*="conversation-title"]',
      '[class*="chat-title"]',
      '[class*="header"] h1',
      '[class*="header"] [class*="title"]',
    ];

    for (const selector of headerSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent?.trim();
        if (text && text.length > 2 && text.length < 200 &&
            !text.toLowerCase().includes('gemini') && text !== 'Chats') {
          return text;
        }
      }
    }

    // Strategy 3: Extract title from first user message (common pattern)
    const firstUserQuery = document.querySelector('[class*="user-query-container"], [class*="query-content"]');
    if (firstUserQuery) {
      const text = firstUserQuery.innerText?.trim() || '';
      if (text.length >= 5) {
        // Use first line or first 60 chars as title
        const firstLine = text.split('\n')[0].trim();
        if (firstLine.length >= 5 && firstLine.length < 100) {
          return firstLine;
        }
        return text.slice(0, 60) + (text.length > 60 ? '...' : '');
      }
    }

    // Strategy 4: Look at document title but filter out generic ones
    const docTitle = document.title?.replace(' - Gemini', '').replace(' | Gemini', '').trim();
    if (docTitle && docTitle !== 'Chats' && docTitle !== 'Gemini' && docTitle.length > 2) {
      return docTitle;
    }

    // Fallback with thread ID
    const threadId = deriveThreadId();
    if (threadId && threadId !== 'mystuff' && threadId.length > 4) {
      return `Gemini Chat ${threadId.slice(0, 8)}`;
    }

    return 'Untitled Gemini Chat';
  }

  /**
   * Extract messages from conversation with improved scraping
   * Gemini uses user-query-container for user messages
   */
  async function extractMessages() {
    const messages = [];
    const utils = window.threadHubUtils || {};

    // Strategy 1: Look for user-query-container (user) and response-container (assistant)
    const userQueries = document.querySelectorAll('[class*="user-query-container"], [class*="query-content"]');
    const assistantResponses = document.querySelectorAll('[class*="model-response-text"], [class*="response-content"], main [data-md]');

    if (userQueries.length > 0 || assistantResponses.length > 0) {
      const allMessages = [];

      for (const el of userQueries) {
        // Scroll into view to ensure content is loaded
        if (utils.scrollIntoViewAndWait) {
          await utils.scrollIntoViewAndWait(el, { block: 'center' }, 200);
        }

        let text = '';
        if (utils.extractFormattedText) {
          text = utils.extractFormattedText(el);
        } else {
          text = el.innerText?.trim() || '';
        }

        if (text.length >= 5) {
          const timeEl = el.closest('[class*="turn"], [class*="message"]')?.querySelector('time, [datetime]');
          const created_at = timeEl?.getAttribute('datetime') || undefined;
          allMessages.push({ role: 'user', text: text.slice(0, 10000), el, created_at });
        }
      }

      for (const el of assistantResponses) {
        // Skip if this is a child of a user query
        if (el.closest('[class*="user-query"]')) continue;

        // Scroll into view
        if (utils.scrollIntoViewAndWait) {
          await utils.scrollIntoViewAndWait(el, { block: 'center' }, 200);
        }

        let text = '';

        // Try clipboard extraction via copy button (if available)
        const copyButton = el.closest('[class*="response"]')?.querySelector('button[aria-label*="Copy"], button[data-tooltip*="Copy"]');
        if (copyButton && utils.copyViaClipboard) {
          const clipboardContent = await utils.copyViaClipboard(copyButton, 150);
          if (clipboardContent && clipboardContent.length > 5) {
            text = clipboardContent;
          }
        }

        // Fallback to formatted text extraction
        if (!text || text.length < 5) {
          if (utils.extractFormattedText) {
            text = utils.extractFormattedText(el);
          } else {
            text = el.innerText?.trim() || '';
          }
        }

        // Clean up code blocks
        if (utils.cleanupCodeBlocks) {
          text = utils.cleanupCodeBlocks(text);
        }

        if (text.length >= 5) {
          const timeEl = el.closest('[class*="turn"], [class*="message"]')?.querySelector('time, [datetime]');
          const created_at = timeEl?.getAttribute('datetime') || undefined;
          allMessages.push({ role: 'assistant', text: text.slice(0, 10000), el, created_at });
        }
      }

      // Sort by DOM position
      allMessages.sort((a, b) => {
        const pos = a.el.compareDocumentPosition(b.el);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });

      allMessages.forEach((msg, index) => {
        messages.push({ role: msg.role, text: msg.text, index, created_at: msg.created_at });
      });
    }

    // Strategy 2: Fallback - look for [data-md] with "You" prefix
    if (messages.length === 0) {
      const mdElements = document.querySelectorAll('main [data-md]');
      for (const row of mdElements) {
        let text = '';
        if (utils.extractFormattedText) {
          text = utils.extractFormattedText(row);
        } else {
          text = row.innerText?.trim() || '';
        }
        if (text.length < 5) continue;
        const isUser = text.startsWith('You\n') || text.startsWith('You ');
        messages.push({
          role: isUser ? 'user' : 'assistant',
          text: isUser ? text.replace(/^You\n?/, '').trim() : text.slice(0, 10000),
          index: messages.length,
        });
      }
    }

    if (typeof extLog === 'function') {
      extLog('content', 'info', `Extracted ${messages.length} messages from Gemini`);
    }

    return messages;
  }

  /**
   * Extract Gemini Gems (similar to projects)
   * Gemini Gems are customized AI personas
   */
  function extractProjects() {
    const projects = [];
    const seen = new Set();

    // Look for Gem links - they typically appear in sidebar or navigation
    const gemLinks = document.querySelectorAll('a[href*="/gem/"], a[href*="/gems/"]');

    gemLinks.forEach((link) => {
      const href = link.getAttribute('href');
      const gemMatch = href?.match(/\/gems?\/([a-zA-Z0-9_-]+)/i);

      if (gemMatch && !seen.has(gemMatch[1])) {
        seen.add(gemMatch[1]);

        let name = link.textContent?.trim() || '';
        if (!name || name.length < 2) {
          const parent = link.closest('[class*="gem"]') || link.parentElement;
          name = parent?.textContent?.trim().slice(0, 100) || 'Unnamed Gem';
        }

        projects.push({
          provider_project_id: gemMatch[1],
          name: name.slice(0, 100),
          href,
          type: 'gem',
        });
      }
    });

    if (typeof extLog === 'function') {
      extLog('content', 'info', `Gemini discovered ${projects.length} gems/projects`);
    }

    return projects;
  }

  /**
   * Extract sidebar chat list
   * Gemini uses jslog attributes with conversation IDs like "c_1edfe9629e055a14"
   */
  function extractChatList() {
    const chats = [];
    const seen = new Set();

    // Strategy 1: Find conversation items with jslog attributes containing conversation IDs
    // Format: jslog="...BardVeMetadataKey:[...,[\"c_<hex_id>\"...]]..."
    const conversationItems = document.querySelectorAll('[data-test-id="conversation"], .conversation[jslog]');
    conversationItems.forEach((item) => {
      const jslog = item.getAttribute('jslog') || '';
      // Extract conversation ID from jslog - looks for "c_<hex>" pattern
      const idMatch = jslog.match(/"(c_[a-f0-9]+)"/);

      if (idMatch && !seen.has(idMatch[1])) {
        seen.add(idMatch[1]);

        // Get title from .conversation-title child
        const titleEl = item.querySelector('.conversation-title');
        let title = titleEl?.textContent?.trim() || '';

        // Clean up title
        if (title) {
          title = title.replace(/\s+/g, ' ').trim();
        }

        if (typeof extLog === 'function') {
          extLog('content', 'debug', `Gemini chat found: id=${idMatch[1]}, title="${title.slice(0, 30)}"`);
        }

        if (title && title.length >= 3 && title.length < 150) {
          chats.push({
            id: idMatch[1],
            title: title.slice(0, 100),
            href: `/app/${idMatch[1]}`,
          });
        } else {
          chats.push({
            id: idMatch[1],
            title: `Gemini Chat ${idMatch[1].slice(0, 12)}`,
            href: `/app/${idMatch[1]}`,
          });
        }
      }
    });

    // Strategy 2: Fallback - look for links to /app/<id> URLs
    if (chats.length === 0) {
      const appLinks = document.querySelectorAll('a[href*="/app/"]');
      appLinks.forEach((link) => {
        const href = link.getAttribute('href');
        const idMatch = href?.match(/\/app\/([a-zA-Z0-9_-]+)/);

        if (idMatch && !seen.has(idMatch[1])) {
          seen.add(idMatch[1]);
          let title = extractTitleFromLink(link);

          if (title && title.length >= 3 && title.length < 150) {
            chats.push({
              id: idMatch[1],
              title: title.slice(0, 100),
              href,
            });
          }
        }
      });
    }

    if (typeof extLog === 'function') {
      extLog('content', 'info', `Gemini discovered ${chats.length} chats`);
    }

    return chats;
  }

  // Message handler
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type !== 'SCRAPE_THREAD') return false;

    // Early exit for container pages
    if (isContainerPage()) {
      if (typeof extLog === 'function') {
        extLog('content', 'info', 'Gemini skipping container page', window.location.pathname);
      }
      sendResponse({
        success: false,
        error: 'container_page',
        message: 'This is a container page, not a conversation',
      });
      return true;
    }

    if (typeof extLog === 'function') {
      extLog('content', 'info', 'Gemini scrape request received');
    }

    // Handle async extraction
    (async () => {
      try {
        const utils = window.threadHubUtils || {};

        // Scroll to load all lazy-loaded messages before extraction
        if (utils.scrollToLoadAllMessages) {
          const scrollResult = await utils.scrollToLoadAllMessages({
            containerSelector: 'main, [role="main"]',
            messageSelector: '[class*="user-query-container"], [class*="model-response-text"]',
            scrollDelay: 150,
            maxScrollTime: 8000,
          });
          if (typeof extLog === 'function') {
            extLog('content', 'info', 'Gemini scroll-to-load complete', scrollResult);
          }
        }

        const threadId = deriveThreadId();
        const title = getTitle();
        const messages = await extractMessages();
        const chatList = extractChatList();
        const projects = extractProjects();

        const result = {
          success: true,
          provider_thread_id: threadId,
          title,
          provider_summary: undefined,
          messages,
          url: window.location.href,
          chatList,
          projects,
        };

        if (typeof extLog === 'function') {
          extLog('content', 'info', 'Gemini scrape complete', {
            threadId,
            title,
            messageCount: messages.length,
            chatListCount: chatList.length,
          });
        }

        sendResponse(result);
      } catch (err) {
        if (typeof extLog === 'function') {
          extLog('content', 'error', 'Gemini scrape failed', err?.message);
        }
        console.error('Gemini scrape failed', err);
        sendResponse({ success: false, error: err?.message });
      }
    })();

    return true; // Keep channel open for async response
  });

  // Log ready
  if (typeof extLog === 'function') {
    extLog('content', 'info', 'Gemini content script ready, thread:', deriveThreadId());
  }
})();
