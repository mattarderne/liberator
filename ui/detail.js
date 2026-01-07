// Get thread ID from URL params
const params = new URLSearchParams(window.location.search);
const threadId = params.get('id');

let currentThread = null;

async function loadThread() {
  if (!threadId) {
    document.getElementById('title').textContent = 'Error: No thread ID';
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_THREAD',
      threadId,
    });

    if (!response?.success) {
      document.getElementById('title').textContent = 'Error: ' + (response?.error || 'Unknown');
      return;
    }

    currentThread = response.thread;
    renderThread(response.thread, response.messages, response.artifacts);
  } catch (err) {
    console.error('Failed to load thread:', err);
    document.getElementById('title').textContent = 'Error loading thread';
  }
}

function renderThread(thread, messages, artifacts) {
  // Header
  document.getElementById('title').textContent = thread.title || 'Untitled';
  const providerEl = document.getElementById('provider');
  providerEl.textContent = thread.provider;
  providerEl.className = `provider-badge provider-${thread.provider}`;

  // Summary
  document.getElementById('summary').textContent =
    thread.ai_summary || thread.provider_summary || 'No summary available';

  // Status & outcome
  document.getElementById('status').value = thread.status || 'unknown';
  document.getElementById('outcome-prediction').textContent = thread.outcome_prediction || '-';
  document.getElementById('progress-stage').textContent = thread.progress_stage || '-';
  document.getElementById('suggested-next').textContent = thread.suggested_next_step || '-';
  document.getElementById('user-note').value = thread.user_resolution_note || '';

  // Flags
  const flagFields = [
    'contains_pii',
    'contains_legal_sensitive',
    'contains_customer_sensitive',
    'contains_hr_sensitive',
    'contains_security_or_secrets',
  ];
  flagFields.forEach((field) => {
    const el = document.querySelector(`[data-flag="${field}"]`);
    if (el) {
      el.className = `flag ${thread[field] ? 'active' : 'inactive'}`;
    }
  });

  // Messages
  document.getElementById('msg-count').textContent = messages.length;
  const msgContainer = document.getElementById('messages');
  if (messages.length === 0) {
    msgContainer.innerHTML = '<div class="message">No messages</div>';
  } else {
    msgContainer.innerHTML = messages
      .map(
        (m) => {
          const timeStr = m.created_at
            ? `<span class="message-time">${new Date(m.created_at).toLocaleString()}</span>`
            : '';
          return `
          <div class="message ${m.role}">
            <div class="message-header">
              <span class="message-role">${m.role}</span>
              ${timeStr}
            </div>
            <div class="message-text">${escapeHtml(m.text?.slice(0, 500) || '')}</div>
          </div>
        `;
        }
      )
      .join('');
  }

  // Artifacts
  if (artifacts.length > 0) {
    document.getElementById('artifacts-card').style.display = 'block';
    document.getElementById('artifact-count').textContent = artifacts.length;
    document.getElementById('artifacts').innerHTML = artifacts
      .map(
        (a) => `
        <div class="artifact">
          <span class="artifact-type">${a.type}</span>
          <span>${escapeHtml(a.label)}</span>
        </div>
      `
      )
      .join('');
  }

  // Extended metadata (github_repo, organization, created_at)
  if (thread.github_repo) {
    document.getElementById('github-repo-row').style.display = 'flex';
    document.getElementById('github-repo').textContent = thread.github_repo;
  }
  if (thread.organization) {
    document.getElementById('organization-row').style.display = 'flex';
    document.getElementById('organization').textContent = thread.organization;
  }
  if (thread.created_at) {
    document.getElementById('created-at-row').style.display = 'flex';
    document.getElementById('created-at').textContent = new Date(thread.created_at).toLocaleString();
  }

  // Standard metadata
  document.getElementById('thread-id').textContent = thread.id;
  document.getElementById('provider-id').textContent = thread.provider_thread_id;
  const urlEl = document.getElementById('url');
  urlEl.href = thread.url || '#';
  urlEl.textContent = thread.url || '-';
  document.getElementById('last-synced').textContent = thread.last_synced_at
    ? new Date(thread.last_synced_at).toLocaleString()
    : '-';
}

async function saveChanges() {
  if (!currentThread) return;

  const updates = {
    status: document.getElementById('status').value,
    user_resolution_note: document.getElementById('user-note').value,
  };

  // Collect flag states
  document.querySelectorAll('[data-flag]').forEach((el) => {
    const field = el.getAttribute('data-flag');
    updates[field] = el.classList.contains('active');
  });

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'UPDATE_THREAD',
      threadId: currentThread.id,
      updates,
    });

    if (response?.success) {
      currentThread = response.thread;
      alert('Saved!');
    } else {
      alert('Save failed: ' + (response?.error || 'Unknown error'));
    }
  } catch (err) {
    console.error('Save failed:', err);
    alert('Save failed');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Event listeners
document.getElementById('back').addEventListener('click', () => {
  window.close();
});

document.getElementById('save').addEventListener('click', saveChanges);

document.getElementById('open-chat').addEventListener('click', () => {
  if (currentThread?.url) {
    chrome.tabs.create({ url: currentThread.url });
  }
});

// Toggle flags on click
document.querySelectorAll('[data-flag]').forEach((el) => {
  el.addEventListener('click', () => {
    el.classList.toggle('active');
    el.classList.toggle('inactive');
  });
});

// Load on init
loadThread();
