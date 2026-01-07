# Liberator

**Set your AI chats free.** A Chrome extension that liberates your conversations from ChatGPT, Claude, Gemini, Grok, and Copilot into a unified, searchable, local-first database.

## Why Liberator?

Your ideas are scattered across AI walled gardens. Liberator brings them together:

- **One Search, All Providers** - Find any conversation instantly
- **Local-First** - Your data stays on your device, encrypted in IndexedDB
- **Open Source** - Inspect the code, fork it, remix it

## Features

### Core
- **Multi-Provider Support** - ChatGPT, Claude, Gemini, Grok, Microsoft Copilot
- **Instant Search** - Full-text search across all your conversations
- **Provider Filtering** - Quick filters by AI provider
- **Thread Detail View** - See full conversation history with messages

### Advanced
- **TF-IDF Similarity** - Find related conversations automatically
- **PII Detection** - Local scanning for sensitive information
- **Trend Visualizations** - Track your AI usage patterns over time
- **OpenAI Classification** - Automatic summaries and categorization (optional)

### Demo Mode
- **Try Without Risk** - 75 realistic demo threads
- **Separate Database** - Demo data never mixes with real data
- **Full Feature Demo** - Test everything before syncing real conversations

## Installation

### From Source
1. Clone this repository
2. Open `chrome://extensions` in Chrome/Brave/Arc
3. Enable **Developer mode**
4. Click **Load unpacked** and select this directory

### From Chrome Web Store
Coming soon.

## Usage

1. **Sync** - Open your AI chat tabs and click "Sync Now" in the popup
2. **Search** - Use the popup or full search page to find conversations
3. **View** - Click any thread to see the full conversation
4. **Filter** - Use provider filters to narrow results

## Architecture

```
liberator/
├── background.js          # Service worker: sync coordination
├── storage.js             # IndexedDB operations
├── similarity.js          # TF-IDF similarity matching
├── pii-detector.js        # Local PII pattern detection
├── content/               # Provider-specific extractors
│   ├── chatgpt.js
│   ├── claude.js
│   ├── gemini.js
│   ├── grok.js
│   └── copilot.js
├── ui/
│   ├── popup.html         # Extension popup
│   ├── search.html        # Full-page search
│   ├── view.html          # Thread detail view
│   └── options.html       # Settings
├── demo/
│   └── demo-mode.js       # Demo database management
└── docs/
    └── index.html         # Landing page (GitHub Pages)
```

## Privacy

- **Local-Only Storage** - All data stored in browser IndexedDB
- **No Tracking** - No analytics, no telemetry
- **No External Calls** - Except optional OpenAI API for classification
- **Open Source** - Audit the code yourself

See [Privacy Policy](privacy.html) for details.

## Development

```bash
# Install dependencies
npm install

# Run tests
npx ts-node tests/demo.test.ts

# Record demo video
npx ts-node scripts/record-demo.ts
```

## Open Ideas

This project is an experiment in **Open Ideas** - the concept that with AI coding assistants, sharing a well-crafted prompt can be more valuable than sharing code.

Click "Remix This" on the [landing page](https://mattarderne.github.io/liberator) to get a prompt that can recreate this extension.

## License

MIT
