(function () {
  'use strict';

  // Log initialization
  if (typeof extLog === 'function') {
    extLog('content', 'info', 'Grok content script loaded', window.location.href);
  }

  /**
   * Container pages that should not be scraped as threads
   */
  const CONTAINER_PAGES = [
    '/highlights',    // Highlights listing
    '/trends',        // Trends listing
    '/project',       // Project page
    '/settings',      // Settings
  ];

  /**
   * Check if current URL is a container page
   */
  function isContainerPage() {
    const path = window.location.pathname;
    const hash = window.location.hash.replace('#', '');
    // Home page without conversation hash
    if ((path === '/' || path === '' || path === '/c') && !hash) {
      return true;
    }
    return CONTAINER_PAGES.some(container =>
      path === container || path.startsWith(container + '/')
    );
  }

  /**
   * Extract thread ID from URL
   * Formats:
   * - https://grok.com/ (home/new chat)
   * - https://grok.com/c#<CONV_ID>
   * - https://grok.com/#<CONV_ID>
   * - https://grok.com/c#private
   */
  function deriveThreadId() {
    const url = new URL(window.location.href);
    const path = url.pathname.split('/').filter(Boolean);
    const hash = url.hash.replace('#', '');

    // Hash-based conversation ID
    if (hash && hash !== 'private') {
      return hash;
    }

    // Private chat
    if (hash === 'private') {
      return 'private-' + Date.now();
    }

    // Path-based routes
    if (path[0] === 'highlights' && path[1]) {
      return `highlight-${path[1]}`;
    }

    if (path[0] === 'trends' && path[1]) {
      return `trend-${path[1]}`;
    }

    if (path[0] === 'project') {
      return 'project';
    }

    // Default - home/new chat
    return 'grok-home';
  }

  /**
   * Get conversation title
   */
  function getTitle() {
    const selectors = [
      // Page heading
      'h1',
      // Title in conversation area
      '[class*="title"]',
      // Active navigation item
      'nav [aria-current="page"]',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent?.trim();
        if (text && text.length > 2 && text.length < 200 && !text.toLowerCase().includes('grok')) {
          return text;
        }
      }
    }

    // Check if it's a special page
    const url = new URL(window.location.href);
    if (url.pathname.includes('highlights')) return 'Grok Highlights';
    if (url.pathname.includes('trends')) return 'Grok Trends';
    if (url.hash === '#private') return 'Private Chat';

    return document.title?.replace(' | Grok', '').trim() || 'Grok Conversation';
  }

  /**
   * Extract messages from conversation
   * Now async to support scrolling each message into view
   */
  async function extractMessages() {
    const messages = [];
    const utils = window.threadHubUtils || {};

    // Strategy 1: Look for message-bubble elements
    // User messages don't have bg-surface-l1, assistant messages do
    const messageBubbles = document.querySelectorAll('[class*="message-bubble"]');

    if (messageBubbles.length > 0) {
      for (const bubble of messageBubbles) {
        // Scroll into view to ensure content is loaded
        if (utils.scrollIntoViewAndWait) {
          await utils.scrollIntoViewAndWait(bubble, { block: 'center' }, 150);
        }

        let text = '';
        if (utils.extractFormattedText) {
          text = utils.extractFormattedText(bubble);
        } else {
          text = bubble.innerText?.trim() || '';
        }

        if (text.length < 5) continue;

        // Grok assistant messages have bg-surface-l1 class, user messages don't
        const classes = bubble.className || '';
        const isAssistant = classes.includes('bg-surface-l1');

        // Try to find timestamp
        const timeEl = bubble.closest('[class*="message"], [class*="turn"]')?.querySelector('time, [datetime]');
        const created_at = timeEl?.getAttribute('datetime') || undefined;

        messages.push({
          role: isAssistant ? 'assistant' : 'user',
          text: text.slice(0, 10000),
          index: messages.length,
          created_at,
        });
      }
    }

    // Strategy 2: Fallback - look for generic message containers
    if (messages.length === 0) {
      const messageContainers = document.querySelectorAll('[class*="message"], [class*="turn"]');
      for (const container of messageContainers) {
        if (utils.scrollIntoViewAndWait) {
          await utils.scrollIntoViewAndWait(container, { block: 'center' }, 150);
        }

        let text = '';
        if (utils.extractFormattedText) {
          text = utils.extractFormattedText(container);
        } else {
          text = container.innerText?.trim() || '';
        }

        if (text.length < 5) continue;
        const isUser = container.classList.toString().includes('user');

        messages.push({
          role: isUser ? 'user' : 'assistant',
          text: text.slice(0, 10000),
          index: messages.length,
        });
      }
    }

    if (typeof extLog === 'function') {
      extLog('content', 'info', `Extracted ${messages.length} messages from Grok`);
    }

    return messages;
  }

  /**
   * Extract Grok projects (if any)
   * Grok may have project-like features in the future
   */
  function extractProjects() {
    const projects = [];
    const seen = new Set();

    // Look for project links
    const projectLinks = document.querySelectorAll('a[href*="/project/"]');

    projectLinks.forEach((link) => {
      const href = link.getAttribute('href');
      const projectMatch = href?.match(/\/project\/([a-zA-Z0-9_-]+)/i);

      if (projectMatch && !seen.has(projectMatch[1])) {
        seen.add(projectMatch[1]);

        let name = link.textContent?.trim() || '';
        if (!name || name.length < 2) {
          const parent = link.closest('[class*="project"]') || link.parentElement;
          name = parent?.textContent?.trim().slice(0, 100) || 'Unnamed Project';
        }

        projects.push({
          provider_project_id: projectMatch[1],
          name: name.slice(0, 100),
          href,
          type: 'project',
        });
      }
    });

    if (typeof extLog === 'function') {
      extLog('content', 'info', `Grok discovered ${projects.length} projects`);
    }

    return projects;
  }

  /**
   * Extract chat list from sidebar
   * Grok uses /c/<uuid> format for chat URLs
   */
  function extractChatList() {
    const chats = [];
    const seen = new Set();

    // Strategy 1: Look for links to /c/<uuid> conversations
    const chatLinks = document.querySelectorAll('a[href*="/c/"]');
    chatLinks.forEach((link) => {
      const href = link.getAttribute('href');
      // Match /c/ followed by UUID
      const idMatch = href?.match(/\/c\/([a-f0-9-]+)/i);

      if (idMatch && !seen.has(idMatch[1])) {
        seen.add(idMatch[1]);

        // Get title from link or parent
        let title = link.textContent?.trim() || '';

        // Clean up title - remove excessive whitespace
        title = title.replace(/\s+/g, ' ').trim();

        if (title.length < 3 || title.length > 150) {
          const parent = link.closest('[class*="conversation"], [class*="chat"], [class*="history"], [class*="item"], li');
          if (parent) {
            title = parent.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100) || '';
          }
        }

        // Remove query params from href for cleaner URLs
        const cleanHref = href.split('?')[0];

        if (title && title.length >= 3 && title.length < 150) {
          chats.push({
            id: idMatch[1],
            title: title.slice(0, 100),
            href: cleanHref,
          });
        } else {
          // Still add with placeholder title
          chats.push({
            id: idMatch[1],
            title: `Grok Chat ${idMatch[1].slice(0, 8)}`,
            href: cleanHref,
          });
        }

        if (typeof extLog === 'function') {
          extLog('content', 'debug', `Grok chat found: id=${idMatch[1].slice(0, 8)}, title="${title.slice(0, 30)}"`);
        }
      }
    });

    // Strategy 2: Look for conversation items in sidebar with data attributes
    if (chats.length === 0) {
      const listItems = document.querySelectorAll('[data-conversation-id], [data-chat-id], [class*="conversation-item"], [class*="chat-item"]');
      listItems.forEach((item) => {
        const id = item.getAttribute('data-conversation-id') || item.getAttribute('data-chat-id');
        const link = item.querySelector('a[href*="/c/"]') || item.closest('a[href*="/c/"]');
        const href = link?.getAttribute('href');
        const idMatch = href?.match(/\/c\/([a-f0-9-]+)/i) || (id ? [null, id] : null);

        if (idMatch && idMatch[1] && !seen.has(idMatch[1])) {
          seen.add(idMatch[1]);
          const title = item.textContent?.trim() || '';
          if (title && title.length >= 3 && title.length < 100) {
            chats.push({
              id: idMatch[1],
              title: title.slice(0, 100),
              href: href?.split('?')[0] || `/c/${idMatch[1]}`,
            });
          }
        }
      });
    }

    // Strategy 3: Fallback - look for highlight/trend cards (for Grok explore pages)
    if (chats.length === 0) {
      const cards = document.querySelectorAll('a[href*="/highlights/"], a[href*="/trends/"]');
      cards.forEach((card) => {
        const href = card.getAttribute('href');
        const highlightMatch = href?.match(/\/highlights\/([^/?]+)/);
        const trendMatch = href?.match(/\/trends\/([^/?]+)/);
        const id = highlightMatch?.[1] || trendMatch?.[1];

        if (id && !seen.has(id)) {
          seen.add(id);
          const title = card.textContent?.trim() || '';
          if (title && title.length >= 3 && title.length < 100) {
            chats.push({
              id,
              title: title.slice(0, 100),
              href,
            });
          }
        }
      });
    }

    if (typeof extLog === 'function') {
      extLog('content', 'info', `Grok discovered ${chats.length} chats`);
    }

    return chats;
  }

  // Message handler
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type !== 'SCRAPE_THREAD') return;

    // Early exit for container pages
    if (isContainerPage()) {
      if (typeof extLog === 'function') {
        extLog('content', 'info', 'Grok skipping container page', window.location.pathname);
      }
      sendResponse({
        success: false,
        error: 'container_page',
        message: 'This is a container page, not a conversation',
      });
      return true;
    }

    if (typeof extLog === 'function') {
      extLog('content', 'info', 'Grok scrape request received');
    }

    // Handle async extraction
    (async () => {
      try {
        const utils = window.threadHubUtils || {};

        // Scroll to load all lazy-loaded messages before extraction
        if (utils.scrollToLoadAllMessages) {
          const scrollResult = await utils.scrollToLoadAllMessages({
            containerSelector: 'main, [role="main"], [class*="conversation"]',
            messageSelector: '[class*="message-bubble"]',
            scrollDelay: 150,
            maxScrollTime: 8000,
          });
          if (typeof extLog === 'function') {
            extLog('content', 'info', 'Grok scroll-to-load complete', scrollResult);
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
          extLog('content', 'info', 'Grok scrape complete', {
            threadId,
            title,
            messageCount: messages.length,
            chatListCount: chatList.length,
          });
        }

        sendResponse(result);
      } catch (err) {
        if (typeof extLog === 'function') {
          extLog('content', 'error', 'Grok scrape failed', err?.message);
        }
        console.error('Grok scrape failed', err);
        sendResponse({ success: false, error: err?.message });
      }
    })();

    return true; // Keep channel open for async response
  });

  // Log ready
  if (typeof extLog === 'function') {
    extLog('content', 'info', 'Grok content script ready, thread:', deriveThreadId());
  }
})();
