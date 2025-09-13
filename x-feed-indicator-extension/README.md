

Overview
- Scrapes tweet data from X/Twitter timeline and injects inflammatory content indicators
- Uses AI classification with 1-5 scale rating system
- Smart caching system prioritizes most inflammatory tweets

Install (Unpacked)
- In Chrome, open `chrome://extensions`
- Enable Developer Mode (top-right)
- Click "Load unpacked" and select the `x-feed-indicator-extension` folder
- Navigate to `https://x.com` and open the home feed
- Open DevTools Console to see logged data prefixed with `[XFI]`

Files
- `manifest.json`: MV3 manifest
- `scripts/content.js`: Tweet detection, data extraction, AI classification
- `scripts/background.js`: Anthropic API integration
- `options/index.html` + `options/index.js`: Settings and API key storage
- `popup/index.html` + `popup/index.js`: Classification interface

Features
- Real-time inflammatory content detection (1-5 scale)
- Account type detection (verified, government, business)
- Engagement metrics tracking (likes, comments, retweets)
- Smart caching (30 most inflammatory tweets)
- Political ideology spectrum (left, left-center, center, right-center, right)

Anthropic Integration
- Set your API key in extension Options (`sk-ant-...`)
- Uses Claude-3.7-Sonnet model for classification
- Concurrency limited to 2 simultaneous requests
- Keys stored via `chrome.storage.local`

Classification System
- 1-5 inflammatory scale with color-coded indicators
- Custom classification prompts supported
- Real-time processing with smart deduplication
- Error handling for missing API keys or failed requests
