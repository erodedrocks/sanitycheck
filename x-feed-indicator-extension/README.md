X/Twitter Feed Indicator (Chrome MV3)

Overview
- Scrapes basic information from tweets on X/Twitter home timeline and injects a small on-page indicator per processed tweet.
- Uses a content script with a MutationObserver to handle infinite scroll.

Install (Unpacked)
- In Chrome, open `chrome://extensions`.
- Enable Developer Mode (top-right).
- Click "Load unpacked" and select the `x-feed-indicator-extension` folder.
- Navigate to `https://x.com` or `https://twitter.com` and open the home feed.
- Open DevTools Console to see logged scraped data prefixed with `[XFI]`.

Files
- `manifest.json`: MV3 manifest.
- `scripts/content.js`: Observes tweets, scrapes data, injects indicator.
- `styles/content.css`: Styles for the indicator.
- `scripts/background.js`: Service worker stub for future messaging/storage.
- `options/index.html` + `options/index.js`: Toggle + Anthropic API key storage.
- `popup/index.html` + `popup/index.js`: Prompt UI to call Anthropic (Haiku).
- `popup/styles.css`: Popup styling.

Customization
- Change the indicator text or logic in `ensureIndicator()` within `scripts/content.js`.
- Extend `extractTweetData()` to collect additional fields.
- Wire up messaging in `content.js` and `background.js` if you need to aggregate or forward data.

Anthropic Integration
- Set your API key: open the extension’s Options and paste your Anthropic key (`sk-ant-...`).
- Open the popup, enter a prompt, and click Send.
- The background worker calls `https://api.anthropic.com/v1/messages` with model `claude-3-haiku-20240307` (cheapest), `max_tokens: 256`.
- Host permissions include `https://api.anthropic.com/*` to enable cross-origin fetch from the service worker.

Notes
- Keys are stored via `chrome.storage.local` on this device.
- If you need streaming responses, we can switch to the streaming API and forward chunks to the popup.

Tweet Classification
- Options page now includes a “Classification Prompt” textarea for your custom instructions and examples.
- Content script scrapes each tweet’s text and asks the background to classify it (1-5) using your prompt.
- Indicators are color-coded by level: 1 (green) → 5 (red). Hovering not required.
- Concurrency limited to 2 in-flight classifications to reduce API load.
- If the API key is missing or parsing fails, the badge stays grey with “?”

Caveats
- X/Twitter DOM changes over time; selectors are written to be resilient but may need updates.
- This template runs only on `x.com`/`twitter.com` domains via `host_permissions`.
