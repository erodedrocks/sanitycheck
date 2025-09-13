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
        const { text, model = 'claude-3-7-sonnet-20250219', fullData} = message.payload || {};
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
        let system = (classificationPrompt || defaultPrompt());
        // Migration guard: if an older single-digit prompt is stored, replace with new default
        if (/Output\s+ONLY\s+a\s+single\s+digit/i.test(system) && !/two\s+numbers/i.test(system)) {
          system = defaultPrompt();
        }
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
              { role: 'user', content: `Sender:\n"${fullData.displayName}"Tweet:\n"${text}"\nLikes:${fullData.likeCount}\nReposts:${fullData.retweetCount}\nComments:${fullData.commentCount}\nLabel:` },
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
        const parsed = parseComposite(firstText);
        if (!parsed) {
          sendResponse({ error: 'Could not parse rating/ideology', raw: data, text: firstText });
          return;
        }
        sendResponse({ rating: parsed.rating, ideology: parsed.ideology, raw: data });
      } catch (e) {
        sendResponse({ error: e?.message || String(e) });
      }
    })();
    return true;
  }
});

function parseComposite(s) {
  if (!s) return null;
  const str = String(s).trim();
  // Expect formats like: "3, -1" or "2,0" (no extra text)
  const m = str.match(/\b([1-5])\b\s*,\s*([+-]?\d*)\b/);
  if (!m) return null;
  const rating = parseInt(m[1], 10);
  const ideology = parseInt(m[2], 10);
  if (!(rating >= 1 && rating <= 5)) return null;
  if (!((ideology >= -2 && ideology <= 2) || ideology == -10)) return null;
  return { rating, ideology };
}

function defaultPrompt() {
  return `You are a strict classifier.
Rate the tweet on two dimensions and output both as numbers:

Dimension A (Inflammatory, 1-5):
- 1: Not inflammatory. Neutral or polite.
- 2: Slightly inflammatory. Minor negativity or sarcasm.
- 3: Moderately inflammatory. Clear negativity, dismissiveness, or provocation.
- 4: Very inflammatory. Personal attacks, insults, or aggressive tone.
- 5: Highly inflammatory. Harassment, hateful or severe attacks.

Dimension B (Political Ideology, -2 to 2):
- -2: Strongly left/liberal/progressive.
- -1: Mildly left-leaning.
- 0: Neutral/non-political/unclear.
- 1: Mildly right-leaning.
- 2: Strongly right/conservative.

Rules:
- Output ONLY two numbers separated by a comma: "A,B".
- A = 1 to 5 (inflammatory). B = -2 to 2 (ideology). No extra words.
- Do not include labels, punctuation (other than the comma), or explanations.

Now classify the tweet. REMEMBER: Output ONLY two numbers as "A,B" with no extra text.`;
}
