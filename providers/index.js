const PROVIDERS = [
  {
    id: 'chatgpt',
    match: (url) => url.includes('chatgpt.com') || url.includes('chat.openai.com'),
    contentScript: 'chatgpt',
    buildUrl: (chatId) => {
      // Handle codex sessions
      if (chatId.startsWith('codex-task-')) {
        return `https://chatgpt.com/codex/tasks/${chatId.replace('codex-task-', '')}`;
      }
      if (chatId.startsWith('codex-')) {
        return `https://chatgpt.com/codex/${chatId.replace('codex-', '')}`;
      }
      return `https://chatgpt.com/c/${chatId}`;
    },
  },
  {
    id: 'gemini',
    match: (url) => url.includes('gemini.google.com'),
    contentScript: 'gemini',
    buildUrl: (chatId) => `https://gemini.google.com/app/${chatId}`,
  },
  {
    id: 'claude',
    match: (url) => url.includes('claude.ai'),
    contentScript: 'claude',
    buildUrl: (chatId) => {
      // Handle code sessions
      if (chatId.startsWith('code-')) {
        return `https://claude.ai/code/${chatId.replace('code-', '')}`;
      }
      // Handle project chats
      if (chatId.startsWith('project-')) {
        return `https://claude.ai/project/${chatId.replace('project-', '')}`;
      }
      return `https://claude.ai/chat/${chatId}`;
    },
  },
  {
    id: 'grok',
    // Use regex to match exact domain (avoid matching ngrok.com, etc.)
    match: (url) => {
      try {
        const hostname = new URL(url).hostname;
        return hostname === 'grok.com' || hostname === 'www.grok.com' ||
               (hostname === 'x.com' && url.includes('/i/grok'));
      } catch {
        return false;
      }
    },
    contentScript: 'grok',
    buildUrl: (chatId) => `https://grok.com/c/${chatId}`,
  },
  {
    id: 'copilot',
    match: (url) => {
      try {
        const hostname = new URL(url).hostname;
        return hostname === 'copilot.microsoft.com' ||
               hostname === 'm365.cloud.microsoft';
      } catch {
        return false;
      }
    },
    contentScript: 'copilot',
    buildUrl: (chatId) => {
      // M365 chats vs personal Copilot chats
      if (chatId.startsWith('m365-')) {
        return `https://m365.cloud.microsoft/chat?chatId=${chatId.replace('m365-', '')}`;
      }
      return `https://copilot.microsoft.com/chats/${chatId}`;
    },
  },
];

function detectProvider(url) {
  return PROVIDERS.find((p) => p.match(url));
}

// Base URLs for each provider (used for relative href resolution)
const PROVIDER_BASE_URLS = {
  chatgpt: 'https://chatgpt.com',
  gemini: 'https://gemini.google.com',
  claude: 'https://claude.ai',
  grok: 'https://grok.com',
  copilot: 'https://copilot.microsoft.com',
};

/**
 * Build a URL for a specific chat
 * @param {string} providerId - Provider ID (chatgpt, gemini, claude, grok)
 * @param {string} chatId - The chat/thread ID
 * @param {string} [existingHref] - An existing href from discovery (preferred if available)
 * @returns {string|null} The full URL or null if can't build
 */
function getProviderUrlForChat(providerId, chatId, existingHref) {
  // If we have an existing href from discovery, use it (most reliable)
  if (existingHref) {
    // Already a full URL
    if (existingHref.startsWith('http')) {
      return existingHref;
    }
    // Relative path - prepend base URL
    const baseUrl = PROVIDER_BASE_URLS[providerId];
    if (baseUrl) {
      // Ensure single slash between base and path
      const path = existingHref.startsWith('/') ? existingHref : '/' + existingHref;
      return baseUrl + path;
    }
  }

  // Build from provider pattern
  const provider = PROVIDERS.find((p) => p.id === providerId);
  if (provider?.buildUrl) {
    return provider.buildUrl(chatId);
  }

  return null;
}

export { PROVIDERS, detectProvider, getProviderUrlForChat };
