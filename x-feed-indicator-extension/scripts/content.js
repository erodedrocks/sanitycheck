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
  const processedTweets = new Set(); // Global deduplication

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
      // Extract account name
      const nameElement = article.querySelector('div[data-testid="User-Name"] span span, [data-testid="User-Name"] span span');
      const accountName = nameElement ? nameElement.textContent.trim() : '';
      
      // Extract tweet text
      const textElement = article.querySelector('div[data-testid="tweetText"], [lang] div[dir="auto"], div[lang]');
      const tweetText = textElement ? textElement.textContent.trim() : '';
      
      // Extract timestamp
      const timeElement = article.querySelector('time');
      const timestamp = timeElement ? (timeElement.getAttribute('datetime') || timeElement.textContent.trim()) : '';
      
      // Extract tweet ID and handle from status link
      let tweetId = null;
      let handle = null;
      const statusLink = article.querySelector('a[href*="/status/"]');
      if (statusLink) {
        const match = statusLink.href.match(/status\/(\d+)/);
        if (match) tweetId = match[1];
        
        // Extract handle from URL path like "/piersmorgan/status/..."
        const handleMatch = statusLink.href.match(/\/([^\/]+)\/status\//);
        if (handleMatch) handle = '@' + handleMatch[1];
      }
      
      // Extract verified status
      const verifiedElement = article.querySelector('[data-testid="icon-verified"]');
      const isVerified = !!verifiedElement;
      
      // Extract engagement metrics
      let likeCount = 0;
      let commentCount = 0;
      let retweetCount = 0;
      
      // Look for engagement buttons and extract counts
      const likeButton = article.querySelector('[data-testid="like"]');
      if (likeButton) {
        const likeText = likeButton.getAttribute('aria-label') || '';
        const likeMatch = likeText.match(/(\d+)/);
        if (likeMatch) likeCount = parseInt(likeMatch[1], 10);
      }
      
      const commentButton = article.querySelector('[data-testid="reply"]');
      if (commentButton) {
        const commentText = commentButton.getAttribute('aria-label') || '';
        const commentMatch = commentText.match(/(\d+)/);
        if (commentMatch) commentCount = parseInt(commentMatch[1], 10);
      }
      
      const retweetButton = article.querySelector('[data-testid="retweet"]');
      if (retweetButton) {
        const retweetText = retweetButton.getAttribute('aria-label') || '';
        const retweetMatch = retweetText.match(/(\d+)/);
        if (retweetMatch) retweetCount = parseInt(retweetMatch[1], 10);
      }
      
      // Only return data if we have tweet text
      if (tweetText) {
        const data = {
          id: tweetId || '',
          displayName: accountName || '',
          handle: handle || '',
          text: tweetText,
          timestamp: timestamp || '',
          isVerified: isVerified || null,
          likeCount: likeCount || null,
          commentCount: commentCount || null,
          retweetCount: retweetCount || null,
        };
        
        // Debug: print all extracted values
        console.log('[XFI] Extracted tweet data:', data);
        
        return data;
      }
      
      return null;
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
    
    // Create unique identifier for deduplication
    const tweetId = `${data.displayName || 'unknown'}-${data.text}-${data.timestamp || 'no-time'}`;
    
    // Skip if already processed
    if (processedTweets.has(tweetId)) return;
    
    // Enqueue classification only when text is available and not already done/pending
    const state = article.getAttribute(STATE_ATTR);
    if (config.enabled && data.text && state !== 'done' && state !== 'pending') {
      // mark pending immediately to avoid duplicated enqueues
      article.setAttribute(STATE_ATTR, 'pending');
      processedTweets.add(tweetId);
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
