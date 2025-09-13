// X/Twitter Feed Indicator — Background (Service Worker)
// Placeholder for future logic (e.g., external API calls, storage, rules).

chrome.runtime.onInstalled.addListener(() => {
  // Initialize defaults or perform migration steps.
  chrome.storage.local.get(['xfiEnabled', 'classificationPrompt']).then((cur) => {
    const updates = {};
    if (typeof cur.xfiEnabled === 'undefined') updates.xfiEnabled = true;
    if (!cur.classificationPrompt) updates.classificationPrompt = defaultPrompt();
    if (Object.keys(updates).length) chrome.storage.local.set(updates).catch(() => {});
  }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Example message router
  if (message && message.type === 'PING') {
    sendResponse({ ok: true, pong: Date.now() });
    return true; // keep channel open for async if needed
  }

  // If scraping data was sent from the content script, handle here:
  // if (message.type === 'TWEET_SCRAPED') {
  //   // e.g. collect, deduplicate, or forward to a backend
  // }

  if (message && message.type === 'ANTHROPIC_CLASSIFY') {
    (async () => {
      try {
        const { text, model = 'claude-3-haiku-20240307', fullData} = message.payload || {};
        if (!text || !text.trim()) {
          sendResponse({ error: 'Missing tweet text' });
          return;
        }
        const { anthropicApiKey, classificationPrompt } = await chrome.storage.local.get([
          'anthropicApiKey',
          'classificationPrompt',
        ]);
        if (!anthropicApiKey) {
          sendResponse({ error: 'Missing Anthropic API key. Set it in Options.' });
          return;
        }
        const system = (classificationPrompt || defaultPrompt());
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': anthropicApiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': true
          },
          body: JSON.stringify({
            model,
            max_tokens: 16,
            temperature: 0,
            system,
            messages: [
              { role: 'user', content: `Tweet:\n"${text}"\nLikes:${fullData.likeCount}\nReposts:${fullData.retweetCount}\nComments:${fullData.commentCount}\nLabel:` },
            ],
          }),
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          sendResponse({ error: `API ${resp.status}: ${text || resp.statusText}` });
          return;
        }
        const data = await resp.json();
        const content = Array.isArray(data?.content) ? data.content : [];
        const firstText = content.find((c) => c?.type === 'text')?.text || '';
        const rating = parseRating(firstText);
        if (!rating) {
          sendResponse({ error: 'Could not parse rating', raw: data, text: firstText });
          return;
        }
        sendResponse({ rating, raw: data });
      } catch (e) {
        sendResponse({ error: e?.message || String(e) });
      }
    })();
    return true;
  }
});

function parseRating(s) {
  if (!s) return null;
  const m = String(s).match(/\b([1-5])\b/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

function defaultPrompt() {
  return `You are a strict classifier.
Rate how inflammatory the following tweet is on a scale of 1-5:

Definition:
- 1: Not inflammatory. Neutral or polite.
- 2: Slightly inflammatory. Minor negativity or sarcasm.
- 3: Moderately inflammatory. Clear negativity, dismissiveness, or provocation.
- 4: Very inflammatory. Personal attacks, insults, or aggressive tone.
- 5: Highly inflammatory. Harassment, hateful or severe attacks.

Rules:
- Output ONLY a single digit. Either 1,2,3,4, or 5.
- No extra words, punctuation, or explanation.

Examples:
Tweet: "I disagree with this policy but let's discuss."
Likes: 9432
Reposts: 96
Comments: 210
Label: 2

Tweet: "You're clueless and your take is garbage."
Likes: 1250
Reposts: 975
Comments: 2041
Label: 4

Tweet: "We should fire anyone who thinks this."
Likes: 73
Reposts: 67
Comments: 92
Label: 3

Now classify the tweet. REMEMBER: Output ONLY a single digit. Either 1,2,3,4, or 5.`;
}
