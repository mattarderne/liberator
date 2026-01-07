(function () {
  'use strict';

  // Log initialization
  if (typeof extLog === 'function') {
    extLog('content', 'info', 'Claude content script loaded', window.location.href);
  }

  /**
   * Container pages that should not be scraped as threads
   * These are listing/navigation pages, not actual conversations
   */
  const CONTAINER_PAGES = [
    '/artifacts',     // Artifacts listing page
    '/projects',      // Projects listing page
    '/chats',         // Chats listing page
    '/recents',       // Recent chats page
    '/settings',      // Settings page
    '/new',           // New chat page (no content yet)
  ];

  /**
   * Check if current URL is a container page (not a real conversation)
   */
  function isContainerPage() {
    const path = window.location.pathname;
    // Exact matches or prefix matches for container pages
    return CONTAINER_PAGES.some(container =>
      path === container || path.startsWith(container + '/')
    ) || path === '/' || path === '';
  }

  /**
   * Extract thread ID from URL
   * Formats:
   * - https://claude.ai/chat/<UUID> (regular chat)
   * - https://claude.ai/code/<UUID> (Claude Code session)
   * - https://claude.ai/project/<UUID>/chat/<UUID> (project chat)
   */
  function deriveThreadId() {
    const url = new URL(window.location.href);
    const segments = url.pathname.split('/').filter(Boolean);

    // Handle /chat/<uuid>
    if (segments[0] === 'chat' && segments[1]) {
      return segments[1];
    }

    // Handle /code/<uuid> (Claude Code)
    if (segments[0] === 'code' && segments[1]) {
      return `code-${segments[1]}`;
    }

    // Handle /project/<uuid>/chat/<uuid>
    if (segments[0] === 'project' && segments[2] === 'chat' && segments[3]) {
      return segments[3];
    }

    return url.pathname || url.href;
  }

  /**
   * Get the type of Claude page we're on
   */
  function getPageType() {
    const url = new URL(window.location.href);
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] === 'code') return 'code';
    if (segments[0] === 'project') return 'project';
    return 'chat';
  }

  /**
   * Extract GitHub repository info from Claude Code sessions
   */
  function getGithubRepo() {
    const pageType = getPageType();
    if (pageType !== 'code') return null;

    // Look for repo name in Claude Code UI
    const selectors = [
      // Repo display in header
      '[class*="repo"]',
      '[class*="repository"]',
      // GitHub links
      'a[href*="github.com"]',
      // Breadcrumb or path display
      '[class*="breadcrumb"]',
      '[class*="path"]',
      // Workspace indicator
      '[class*="workspace"] [class*="name"]',
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

        // Check text content for repo pattern
        const text = el.textContent?.trim();
        if (text?.match(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/)) {
          return text;
        }
      }
    }

    // Check page title for repo pattern
    const title = document.title;
    const repoMatch = title?.match(/([a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)/);
    if (repoMatch) return repoMatch[1];

    return null;
  }

  /**
   * Extract organization from Claude (Teams/Enterprise)
   */
  function getOrganization() {
    const selectors = [
      '[data-testid*="org"]',
      '[class*="organization"]',
      '[class*="workspace-name"]',
      '[class*="team-name"]',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        const text = el.textContent.trim();
        if (text && text.length > 1 && text.length < 100) {
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
    // Try to find timestamp on first message
    const messages = document.querySelectorAll('[data-testid="user-message"], [class*="font-user-message"]');
    if (messages.length > 0) {
      const firstMsg = messages[0];
      const timeEl = firstMsg.closest('[data-testid]')?.querySelector('time, [datetime]');
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
   * Get chat title from sidebar or page
   */
  function getTitle() {
    // Try multiple selectors for robustness
    const selectors = [
      // Breadcrumb/header title
      '[data-testid="breadcrumb"]',
      // Conversation header
      'h1',
      // Sidebar active chat
      'nav a[aria-current="page"]',
      // Any title-like element
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

  /**
   * Extract messages from the conversation
   * Uses clipboard-based extraction for assistant messages to preserve formatting
   */
  async function extractMessages() {
    const messages = [];
    const utils = window.threadHubUtils || {};

    // Strategy 1: Look for Claude's specific class patterns
    const userMessages = document.querySelectorAll('[data-testid="user-message"], [class*="font-user-message"]');
    const assistantMessages = document.querySelectorAll('div.font-claude-message, [class*="font-claude-response"]');

    if (userMessages.length > 0 || assistantMessages.length > 0) {
      // Collect all messages with their DOM elements for sorting
      const allMessages = [];

      // Process user messages - use formatted text extraction
      for (const el of userMessages) {
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
          const timeEl = el.closest('[data-testid]')?.querySelector('time, [datetime]');
          const created_at = timeEl?.getAttribute('datetime') || timeEl?.getAttribute('title') || undefined;
          allMessages.push({ role: 'user', text: text.slice(0, 10000), el, created_at });
        }
      }

      // Process assistant messages - try clipboard extraction first
      for (const el of assistantMessages) {
        // Scroll into view
        if (utils.scrollIntoViewAndWait) {
          await utils.scrollIntoViewAndWait(el, { block: 'center' }, 200);
        }

        let text = '';

        // Try clipboard-based extraction (more reliable for formatted content)
        const copyButton = el.closest('[data-testid]')?.querySelector('button[data-testid="copy-turn-action-button"]') ||
                          el.parentElement?.querySelector('button[data-testid="action-bar-copy"]') ||
                          el.closest('.group')?.querySelector('button[aria-label*="Copy"], button[title*="Copy"]');

        if (copyButton && utils.copyViaClipboard) {
          const clipboardContent = await utils.copyViaClipboard(copyButton, 150);
          if (clipboardContent && clipboardContent.length > 5) {
            text = clipboardContent;
            if (typeof extLog === 'function') {
              extLog('content', 'debug', 'Claude: Extracted via clipboard', { length: text.length });
            }
          }
        }

        // Fallback to formatted text extraction if clipboard failed
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
          const timeEl = el.closest('[data-testid]')?.querySelector('time, [datetime]');
          const created_at = timeEl?.getAttribute('datetime') || timeEl?.getAttribute('title') || undefined;
          allMessages.push({ role: 'assistant', text: text.slice(0, 10000), el, created_at });
        }
      }

      // Sort by DOM position to maintain conversation order
      allMessages.sort((a, b) => {
        const pos = a.el.compareDocumentPosition(b.el);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });

      allMessages.forEach((msg, index) => {
        messages.push({ role: msg.role, text: msg.text, index, created_at: msg.created_at });
      });
    }

    // Strategy 2: Fallback - look for data-testid patterns
    if (messages.length === 0) {
      const messageContainers = document.querySelectorAll('[data-testid*="message"]');
      for (const container of messageContainers) {
        let text = '';
        if (utils.extractFormattedText) {
          text = utils.extractFormattedText(container);
        } else {
          text = container.innerText?.trim() || '';
        }
        if (text.length < 5) continue;
        const isUser = container.getAttribute('data-testid')?.includes('user');
        messages.push({
          role: isUser ? 'user' : 'assistant',
          text: text.slice(0, 10000),
          index: messages.length,
        });
      }
    }

    if (typeof extLog === 'function') {
      extLog('content', 'info', `Extracted ${messages.length} messages from Claude`);
    }

    return messages;
  }

  /**
   * Extract artifacts (code blocks, documents, etc.)
   * Uses improved extraction with panel detection
   */
  async function extractArtifacts() {
    const artifacts = [];
    const utils = window.threadHubUtils || {};
    const seen = new Set();

    // Strategy 1: Look for artifact blocks in the conversation
    const artifactBlocks = document.querySelectorAll('.artifact-block-cell, [data-testid*="artifact"], [class*="artifact-container"]');

    for (const block of artifactBlocks) {
      try {
        // Get artifact title
        const titleEl = block.querySelector('[class*="title"], [aria-label]');
        const label = titleEl?.textContent?.trim() ||
                     block.getAttribute('data-title') ||
                     block.getAttribute('aria-label') ||
                     `Artifact ${artifacts.length + 1}`;

        // Skip if we've seen this title
        if (seen.has(label)) continue;

        // Try to open the artifact panel and extract from there
        let content = '';
        let language = '';

        // Check if there's a clickable element to open the panel
        const clickable = block.querySelector('button, [role="button"]') || block;

        // Try clicking to open artifact panel
        if (clickable && utils.waitForElement) {
          clickable.click();
          await new Promise(resolve => setTimeout(resolve, 500));

          // Look for artifact panel that opens
          const panel = await utils.waitForElement('[class*="artifact-panel"], [data-testid*="artifact-view"]', document, 2000);

          if (panel) {
            // Try to switch to Code tab if available
            const codeTab = panel.querySelector('button[aria-label="Code"], button:has-text("Code")');
            if (codeTab) {
              codeTab.click();
              await new Promise(resolve => setTimeout(resolve, 300));
            }

            // Try copy button in the panel
            const copyButton = panel.querySelector('button[aria-label*="Copy"], button[title*="Copy"]');
            if (copyButton && utils.copyViaClipboard) {
              content = await utils.copyViaClipboard(copyButton, 200) || '';
            }

            // Detect language from code element
            const codeEl = panel.querySelector('code[class*="language-"]');
            if (codeEl) {
              const langClass = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
              language = langClass ? langClass.replace('language-', '') : '';
            }

            // Close the panel
            const closeButton = panel.querySelector('button[aria-label*="Close"], button[aria-label*="close"]');
            if (closeButton) {
              closeButton.click();
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
        }

        // Fallback: extract directly from block
        if (!content || content.length < 10) {
          const codeEl = block.querySelector('pre code, code');
          if (codeEl) {
            content = codeEl.textContent || '';
            const langClass = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
            language = langClass ? langClass.replace('language-', '') : '';
          } else {
            content = block.textContent?.slice(0, 10000) || '';
          }
        }

        if (content.length > 10) {
          seen.add(label);

          // Determine type
          let type = 'code';
          const lowerLabel = label.toLowerCase();
          if (lowerLabel.includes('html') || lowerLabel.includes('react') || lowerLabel.includes('component')) {
            type = 'web_app';
          } else if (lowerLabel.includes('document') || lowerLabel.includes('markdown') || lowerLabel.includes('.md')) {
            type = 'document';
          }

          artifacts.push({
            type,
            label: label.slice(0, 100),
            language,
            url: window.location.href,
            content: language ? `\`\`\`${language}\n${content}\n\`\`\`` : content.slice(0, 10000),
          });
        }
      } catch (err) {
        if (typeof extLog === 'function') {
          extLog('content', 'warn', 'Artifact extraction failed', err?.message);
        }
      }
    }

    // Strategy 2: Fallback - look for standalone code blocks
    if (artifacts.length === 0) {
      document.querySelectorAll('pre code').forEach((el, index) => {
        const content = el.textContent?.slice(0, 10000) || '';
        if (content.length < 20) return;

        const langClass = Array.from(el.classList).find(c => c.startsWith('language-'));
        const language = langClass ? langClass.replace('language-', '') : '';

        const key = content.slice(0, 100);
        if (seen.has(key)) return;
        seen.add(key);

        artifacts.push({
          type: 'code',
          label: `Code Block ${index + 1}`,
          language,
          url: window.location.href,
          content: language ? `\`\`\`${language}\n${content}\n\`\`\`` : content,
        });
      });
    }

    return artifacts;
  }

  /**
   * Extract projects from Claude
   * Claude Projects appear at /project/<uuid>
   */
  function extractProjects() {
    const projects = [];
    const seen = new Set();

    // Look for project links in sidebar
    const projectLinks = document.querySelectorAll('a[href*="/project/"]');

    projectLinks.forEach((link) => {
      const href = link.getAttribute('href');

      // Extract project ID: /project/<uuid>
      const projectMatch = href?.match(/\/project\/([a-f0-9-]+)/i);

      if (projectMatch && !seen.has(projectMatch[1])) {
        seen.add(projectMatch[1]);

        // Get project name from link or nearby elements
        let name = link.textContent?.trim() || '';
        if (!name || name.length < 2) {
          // Try to get name from parent element
          const parent = link.closest('[class*="project"]') || link.parentElement;
          name = parent?.textContent?.trim().slice(0, 100) || 'Unnamed Project';
        }

        // Try to get description if available
        const descEl = link.closest('[class*="project"]')?.querySelector('[class*="description"]');
        const description = descEl?.textContent?.trim().slice(0, 500) || '';

        projects.push({
          provider_project_id: projectMatch[1],
          name: name.slice(0, 100),
          description,
          href,
          type: 'project',
        });
      }
    });

    // Check if we're currently on a project page
    const currentUrl = new URL(window.location.href);
    const currentProjectMatch = currentUrl.pathname.match(/\/project\/([a-f0-9-]+)/i);
    if (currentProjectMatch && !seen.has(currentProjectMatch[1])) {
      seen.add(currentProjectMatch[1]);

      // Get project name from page header
      const headerEl = document.querySelector('h1, [class*="project-title"], [class*="ProjectTitle"]');
      const name = headerEl?.textContent?.trim().slice(0, 100) || 'Current Project';

      projects.push({
        provider_project_id: currentProjectMatch[1],
        name,
        href: currentUrl.pathname,
        type: 'project',
        isCurrent: true,
      });
    }

    // Also check for Claude Code which acts like a project
    const codeLink = document.querySelector('a[href*="/code"]');
    if (codeLink && !seen.has('claude-code')) {
      seen.add('claude-code');
      projects.push({
        provider_project_id: 'claude-code',
        name: 'Claude Code',
        href: '/code',
        type: 'code',
      });
    }

    if (typeof extLog === 'function') {
      extLog('content', 'info', `Claude discovered ${projects.length} projects`);
    }

    return projects;
  }

  /**
   * Extract sidebar chat list for thread discovery
   * Also discovers projects and code sessions
   */
  function extractChatList() {
    const chats = [];
    const seen = new Set();

    // Strategy 1: Look for any links to /chat/ URLs anywhere on page
    const chatLinks = document.querySelectorAll('a[href*="/chat/"], a[href*="/code/"], a[href*="/project/"]');

    chatLinks.forEach((link) => {
      const href = link.getAttribute('href');

      // Match /chat/<uuid>, /code/<uuid>, or /project/<uuid>
      const chatMatch = href?.match(/\/chat\/([a-f0-9-]+)/i);
      const codeMatch = href?.match(/\/code\/([a-f0-9-]+)/i);
      const projectMatch = href?.match(/\/project\/([a-f0-9-]+)/i);

      let id = null;
      let type = 'chat';

      if (chatMatch) {
        id = chatMatch[1];
        type = 'chat';
      } else if (codeMatch) {
        id = `code-${codeMatch[1]}`;
        type = 'code';
      } else if (projectMatch) {
        id = `project-${projectMatch[1]}`;
        type = 'project';
      }

      if (id && !seen.has(id)) {
        seen.add(id);

        // Get title - try the link text, or find nearby text
        let title = link.textContent?.trim() || '';

        // Skip if title is too short or looks like a button/icon
        if (title.length < 3 || title.length > 150) {
          // Try to find title in parent or sibling
          const parent = link.closest('[class*="conversation"], [class*="chat"], [class*="history"]');
          if (parent) {
            title = parent.textContent?.trim().slice(0, 100) || '';
          }
        }

        // Skip current chat (already being scraped) and empty titles
        if (title && title.length >= 3) {
          chats.push({
            id,
            title: title.slice(0, 100),
            href,
            type,
          });
        }
      }
    });

    // Strategy 2: Look for conversation list items with data attributes
    if (chats.length === 0) {
      const listItems = document.querySelectorAll('[data-testid*="conversation"], [data-testid*="chat"], [class*="conversation-item"]');
      listItems.forEach((item) => {
        const link = item.querySelector('a[href*="/chat/"]') || item.closest('a[href*="/chat/"]');
        const href = link?.getAttribute('href');
        const idMatch = href?.match(/\/chat\/([a-f0-9-]+)/i);

        if (idMatch && !seen.has(idMatch[1])) {
          seen.add(idMatch[1]);
          const title = item.textContent?.trim().slice(0, 100) || '';
          if (title.length >= 3) {
            chats.push({
              id: idMatch[1],
              title,
              href,
            });
          }
        }
      });
    }

    if (typeof extLog === 'function') {
      extLog('content', 'info', `Claude discovered ${chats.length} chats in sidebar`);
    }

    return chats;
  }

  // Message handler for scrape requests
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type !== 'SCRAPE_THREAD') return;

    // Early exit for container pages (artifacts, projects, etc.)
    if (isContainerPage()) {
      if (typeof extLog === 'function') {
        extLog('content', 'info', 'Claude skipping container page', window.location.pathname);
      }
      sendResponse({
        success: false,
        error: 'container_page',
        message: 'This is a container page, not a conversation',
      });
      return true;
    }

    if (typeof extLog === 'function') {
      extLog('content', 'info', 'Claude scrape request received');
    }

    // Handle async extraction
    (async () => {
      try {
        const utils = window.threadHubUtils || {};

        // Scroll to load all lazy-loaded messages before extraction
        if (utils.scrollToLoadAllMessages) {
          const scrollResult = await utils.scrollToLoadAllMessages({
            containerSelector: 'main, [role="main"], [class*="conversation"]',
            messageSelector: '[data-testid="user-message"], div.font-claude-message',
            scrollDelay: 150,
            maxScrollTime: 8000,
          });
          if (typeof extLog === 'function') {
            extLog('content', 'info', 'Claude scroll-to-load complete', scrollResult);
          }
        }

        const threadId = deriveThreadId();
        const title = getTitle();
        const messages = await extractMessages();
        const artifacts = await extractArtifacts();
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
          provider_summary: undefined,
          messages,
          artifacts,
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
          extLog('content', 'info', 'Claude scrape complete', {
            threadId,
            githubRepo,
            organization,
            title,
            messageCount: messages.length,
            artifactCount: artifacts.length,
            chatListCount: chatList.length,
          });
        }

        sendResponse(result);
      } catch (err) {
        if (typeof extLog === 'function') {
          extLog('content', 'error', 'Claude scrape failed', err?.message);
        }
        console.error('Claude scrape failed', err);
        sendResponse({ success: false, error: err?.message });
      }
    })();

    return true; // Keep channel open for async response
  });

  // Log that we're ready
  if (typeof extLog === 'function') {
    extLog('content', 'info', 'Claude content script ready, thread:', deriveThreadId());
  }
})();
