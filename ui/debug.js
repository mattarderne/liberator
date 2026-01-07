let data = null;
let selectedTabId = null;

// Load available tabs
async function loadTabs() {
  try {
    console.log('Loading tabs...');
    const tabs = await chrome.tabs.query({});
    console.log('All tabs:', tabs.length);

    const aiTabs = tabs.filter(tab => {
      const url = tab.url || '';
      return url.includes('chat.openai.com') ||
             url.includes('chatgpt.com') ||
             url.includes('gemini.google.com') ||
             url.includes('claude.ai') ||
             url.includes('grok.com') ||
             url.includes('x.com/i/grok');
    });

    console.log('AI tabs found:', aiTabs.length);

    const selector = document.getElementById('tab-selector');
    if (aiTabs.length === 0) {
      selector.innerHTML = '<option value="">No AI chat tabs found - open ChatGPT/Gemini/Claude first</option>';
      document.getElementById('status').textContent = 'No AI chat tabs open';
      return;
    }

    selector.innerHTML = aiTabs.map(tab => {
      const url = tab.url || '';
      const provider = url.includes('chat.openai.com') || url.includes('chatgpt.com') ? 'ChatGPT' :
                      url.includes('gemini.google.com') ? 'Gemini' :
                      url.includes('claude.ai') ? 'Claude' :
                      url.includes('grok.com') || url.includes('x.com/i/grok') ? 'Grok' : 'Unknown';
      const title = tab.title.substring(0, 50);
      return `<option value="${tab.id}">[${provider}] ${title}</option>`;
    }).join('');

    selectedTabId = aiTabs[0].id;
    document.getElementById('status').textContent = `${aiTabs.length} AI chat tab(s) found - click Capture`;
  } catch (err) {
    console.error('Error loading tabs:', err);
    document.getElementById('status').textContent = `Error: ${err.message}`;
    document.getElementById('tab-selector').innerHTML = `<option value="">Error: ${err.message}</option>`;
  }
}

document.getElementById('tab-selector').addEventListener('change', (e) => {
  selectedTabId = parseInt(e.target.value);
});

// Load tabs on page load
window.addEventListener('DOMContentLoaded', loadTabs);

document.getElementById('capture').addEventListener('click', async () => {
  const status = document.getElementById('status');
  const output = document.getElementById('output');

  try {
    if (!selectedTabId) {
      status.textContent = 'No tab selected';
      return;
    }

    const tab = await chrome.tabs.get(selectedTabId);
    status.textContent = `Tab URL: ${tab.url}`;

    const provider = tab.url.includes('chat.openai.com') || tab.url.includes('chatgpt.com') ? 'ChatGPT' :
                    tab.url.includes('gemini.google.com') ? 'Gemini' :
                    tab.url.includes('claude.ai') ? 'Claude' :
                    tab.url.includes('grok.com') || tab.url.includes('x.com/i/grok') ? 'Grok' : null;

    if (!provider) {
      status.textContent = 'Not an AI chat tab';
      return;
    }

    status.textContent = `Capturing from ${provider}...`;

    // Execute script directly in the tab
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const main = document.querySelector('main');

        // Try multiple selectors for messages
        const messageSelectors = [
          '[data-message-author-role]',
          '[data-testid*="message"]',
          '[data-testid="conversation-turn"]',
          'article',
          '[role="article"]',
          '[class*="message"]',
          'main > div > div > div'
        ];

        const messageData = {};
        messageSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            messageData[selector] = {
              count: elements.length,
              samples: Array.from(elements).slice(0, 5).map((el, idx) => ({
                index: idx,
                tag: el.tagName,
                classes: el.className,
                dataTestId: el.getAttribute('data-testid'),
                dataMessageAuthorRole: el.getAttribute('data-message-author-role'),
                innerText: el.innerText?.substring(0, 300),
                outerHTML: el.outerHTML.substring(0, 500),
                children: el.children.length,
                hasUserIndicator: el.innerHTML.includes('You') || el.innerHTML.includes('user')
              }))
            };
          }
        });

        return {
          url: window.location.href,
          title: document.title,
          mainHTML: main ? main.outerHTML.substring(0, 10000) : 'No main element',
          allDataTestIds: Array.from(new Set(
            Array.from(document.querySelectorAll('[data-testid]'))
              .map(el => el.getAttribute('data-testid'))
          )),
          allClasses: Array.from(new Set(
            Array.from(document.querySelectorAll('main [class*="message"], main article'))
              .flatMap(el => Array.from(el.classList))
          )),
          messageData: messageData,
          potentialMessageCount: Math.max(...Object.values(messageData).map(d => d.count), 0)
        };
      }
    });

    data = { provider, timestamp: new Date().toISOString(), ...result.result };
    output.textContent = JSON.stringify(data, null, 2);
    status.textContent = `✓ Captured from ${provider}`;
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
    output.textContent = err.stack;
  }
});

document.getElementById('export').addEventListener('click', async () => {
  if (!data) {
    alert('No data to export');
    return;
  }

  try {
    // Show save dialog with default filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `dom-capture-${data.provider}-${timestamp}.json`;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });

    // Use File System Access API if available (Chrome 86+)
    if ('showSaveFilePicker' in window) {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'JSON Files',
          accept: { 'application/json': ['.json'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      document.getElementById('status').textContent = '✓ Saved to your selected location';
    } else {
      // Fallback to regular download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      document.getElementById('status').textContent = '✓ Downloaded to your Downloads folder';
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      document.getElementById('status').textContent = 'Save cancelled';
    } else {
      console.error('Export error:', err);
      document.getElementById('status').textContent = `Export failed: ${err.message}`;
    }
  }
});
