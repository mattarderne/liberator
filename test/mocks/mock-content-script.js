// Mock content script that responds to SCRAPE_THREAD messages
// This simulates what the real content scripts do

(function() {
  const provider = window.MOCK_PROVIDER || 'unknown';
  const mockData = window.MOCK_DATA || {};

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request?.type !== 'SCRAPE_THREAD') return false;

    console.log(`[Mock ${provider}] Received SCRAPE_THREAD request`);

    // Return mock scraped data
    const response = {
      success: true,
      provider_thread_id: mockData.threadId || `mock-thread-${Date.now()}`,
      title: mockData.title || document.title,
      provider_summary: mockData.summary || 'Mock conversation summary',
      messages: mockData.messages || [
        { role: 'user', text: 'Mock user message', index: 0 },
        { role: 'assistant', text: 'Mock assistant response', index: 1 },
      ],
      artifacts: mockData.artifacts || [],
      url: window.location.href,
      chatList: mockData.chatList || [],
    };

    console.log(`[Mock ${provider}] Sending response:`, response);
    sendResponse(response);
    return true;
  });

  console.log(`[Mock ${provider}] Content script ready`);
})();
