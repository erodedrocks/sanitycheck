// X/Twitter Feed Indicator — Content Script (MV3)
// Observes the timeline, scrapes basic tweet info, and injects a small indicator.

(function () {
  const PROCESSED_ATTR = "data-xfi-processed"; // indicator injected
  const RATING_ATTR = "data-xfi-rating";      // 1-5
  const STATE_ATTR = "data-xfi-state";        // pending|done|error
  const MAX_CONCURRENCY = 2;
  const queue = [];
  let inFlight = 0;
  let config = { enabled: true };

  function log(...args) {
    // Namespace logs to make them easy to filter in DevTools
    console.log("[XFI]", ...args);
  }

  function selectTweetArticles(root = document) {
    // Target tweet containers. X/Twitter commonly uses these attributes.
    // We intentionally keep this selector conservative and robust to minor changes.
    return root.querySelectorAll('article[role="article"][data-testid="tweet"]');
  }

  function extractTweetData(article) {
    try {
      const data = {
        id: null,
        displayName: null,
        handle: null,
        text: null,
        timestamp: null,
        permalink: null,
      };

      // Attempt to find a status link to extract tweet ID and permalink
      const statusLink = article.querySelector('a[href*="/status/"]');
      if (statusLink) {
        data.permalink = statusLink.href;
        const m = statusLink.href.match(/status\/(\d+)/);
        if (m) data.id = m[1];
      }

      // Display name and handle are under the User-Name testid
      const userNameBlock = article.querySelector('div[data-testid="User-Name"]');
      if (userNameBlock) {
        const spans = Array.from(userNameBlock.querySelectorAll('span'))
          .map((s) => s.textContent || "")
          .filter(Boolean);
        // Heuristics: first non-empty is often display name, first starting with @ is handle
        data.displayName = spans.find((t) => t.trim().length > 0) || null;
        data.handle = spans.find((t) => t.trim().startsWith("@")) || null;
      }

      // Tweet text
      const textBlocks = article.querySelectorAll('div[data-testid="tweetText"]');
      if (textBlocks && textBlocks.length) {
        const text = Array.from(textBlocks)
          .map((n) => n.textContent || "")
          .join("\n")
          .trim();
        data.text = text || null;
      }

      // Timestamp
      const timeEl = article.querySelector('time');
      if (timeEl) {
        data.timestamp = timeEl.getAttribute('datetime') || timeEl.textContent || null;
      }

      return data;
    } catch (err) {
      log("extractTweetData error", err);
      return null;
    }
  }

  function ensureIndicator(article, data) {
    // Attach a single indicator per article
    if (article.querySelector('.xfi-indicator')) return;

    // Prefer adding near the username block to avoid layout shifts
    let anchor = article.querySelector('div[data-testid="User-Name"]');

    const indicator = document.createElement('span');
    indicator.className = 'xfi-indicator';
    // Initial neutral content; pending state is applied when we enqueue
    const wordCount = (data?.text ? data.text.trim().split(/\s+/).filter(Boolean).length : 0);
    indicator.textContent = `Inflammation: … • ${wordCount}w`;

    if (anchor) {
      anchor.appendChild(indicator);
    } else {
      // Fallback: attach to the article; keep it subtle
      article.appendChild(indicator);
      article.classList.add('xfi-article-fallback');
    }

    article.setAttribute(PROCESSED_ATTR, "true");
  }

  function processArticle(article) {
    if (!article) return;
    const data = extractTweetData(article);
    ensureIndicator(article, data);
    if (!data) return;
    // Enqueue classification only when text is available and not already done/pending
    const state = article.getAttribute(STATE_ATTR);
    if (config.enabled && data.text && state !== 'done' && state !== 'pending') {
      // mark pending immediately to avoid duplicated enqueues
      article.setAttribute(STATE_ATTR, 'pending');
      const ind = article.querySelector('.xfi-indicator');
      if (ind) ind.classList.add('pending');
      enqueue(() => classifyArticle(article, data));
    }
  }

  function scanExisting() {
    const articles = selectTweetArticles(document);
    articles.forEach(processArticle);
  }

  function observeTimeline() {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          if (node.matches && node.matches('article[role="article"][data-testid="tweet"]')) {
            processArticle(node);
            continue;
          }

          // If tweet text appears later in an existing article, classify then
          if (node.matches && node.matches('div[data-testid="tweetText"]')) {
            const art = findParentArticle(node);
            if (art) processArticle(art);
          }

          // Search within container for any tweets or tweetText blocks
          const articles = selectTweetArticles(node);
          if (articles.length) articles.forEach(processArticle);

          const tweetTexts = node.querySelectorAll?.('div[data-testid="tweetText"]');
          if (tweetTexts && tweetTexts.length) {
            tweetTexts.forEach((el) => {
              const art = findParentArticle(el);
              if (art) processArticle(art);
            });
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function init() {
    try {
      loadConfig().then(() => {
        scanExisting();
        observeTimeline();
        log("Content script initialized");
      });
    } catch (e) {
      log("Initialization error", e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  function setIndicatorLevel(article, level, wordCount) {
    const ind = article.querySelector('.xfi-indicator');
    if (!ind) return;
    ind.classList.remove('pending', 'error', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5');
    if (typeof level === 'number' && level >= 1 && level <= 5) {
      ind.classList.add(`level-${level}`);
      ind.textContent = `Inflammation: ${level}`;
      article.setAttribute('data-xfi-rating', String(level));
      article.setAttribute('data-xfi-state', 'done');
    } else {
      ind.classList.add('error');
      ind.textContent = `Inflammation: ?`;
      article.setAttribute('data-xfi-state', 'error');
    }
  }

  async function classifyArticle(article, data) {
    if (!data?.text || data?.text == "") return;
    if (article.getAttribute('data-xfi-state') === 'done') return;
    const wordCount = (data.text ? data.text.trim().split(/\s+/).filter(Boolean).length : 0);
    try {
      // Avoid duplicate work: if rating already present, just paint
      const existing = parseInt(article.getAttribute('data-xfi-rating') || '', 10);
      if (existing >= 1 && existing <= 5) {
        setIndicatorLevel(article, existing, wordCount);
        return;
      }
      
      const res = await chrome.runtime.sendMessage({
        type: 'ANTHROPIC_CLASSIFY',
        payload: { text: data.text, model: 'claude-3-haiku-20240307' },
      });
      if (res?.error) {
        log('Classification error', res.error);
        setIndicatorLevel(article, null, wordCount);
        return;
      }
      const rating = res?.rating;
      setIndicatorLevel(article, rating, wordCount);
    } catch (e) {
      log('Classification exception', e);
      setIndicatorLevel(article, null, wordCount);
    }
  }

  function enqueue(task) {
    queue.push(task);
    drain();
  }

  async function drain() {
    if (inFlight >= MAX_CONCURRENCY) return;
    const task = queue.shift();
    if (!task) return;
    inFlight++;
    try {
      await task();
    } finally {
      inFlight--;
      if (queue.length) drain();
    }
  }

  async function loadConfig() {
    try {
      const { xfiEnabled = true } = await chrome.storage.local.get('xfiEnabled');
      config.enabled = !!xfiEnabled;
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.xfiEnabled) {
          config.enabled = !!changes.xfiEnabled.newValue;
        }
      });
    } catch (e) {
      // default stays true
    }
  }

  function findParentArticle(el) {
    let cur = el;
    for (let i = 0; i < 6 && cur; i++) {
      if (cur.matches && cur.matches('article[role="article"][data-testid="tweet"]')) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

})();
