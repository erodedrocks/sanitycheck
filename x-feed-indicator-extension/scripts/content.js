// X/Twitter Feed Indicator
// Observes the timeline, scrapes basic tweet info, and injects a small indicator.

(function () {
  const PROCESSED_ATTR = "data-xfi-processed";
  const RATING_ATTR = "data-xfi-rating";
  const IDEOLOGY_ATTR = "data-xfi-ideology";
  const STATE_ATTR = "data-xfi-state";
  const MAX_CONCURRENCY = 2;
  const MAX_CACHE_SIZE = 500;
  const queue = [];
  let inFlight = 0;
  let config = { enabled: true };
  const processedTweets = new Map();
  const tweetLevels = [];
  this.audioFiles = [];

  function log(...args) {

    console.log("[XFI]", ...args);
  }

  function binarySearch(arr, level) {
    let left = 0;
    let right = arr.length;
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (arr[mid].level < level) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    return left;
  }

  // Add tweet to cache, following priority queue logic
  function addToCache(tweetId, level) {
    // Remove lowest level if cache is full
    if (processedTweets.size >= MAX_CACHE_SIZE) {
      const lowest = tweetLevels.shift();
      processedTweets.delete(lowest.tweetId);
    }
    
    // Insert in sorted position
    const insertPos = binarySearch(tweetLevels, level);
    tweetLevels.splice(insertPos, 0, { tweetId, level });
    processedTweets.set(tweetId, level);
  }

  function selectTweetArticles(root = document) {
    return root.querySelectorAll('article[role="article"][data-testid="tweet"]');
  }

  function extractTweetData(article) {
    try {
      // Get account name
      const nameElement = article.querySelector('div[data-testid="User-Name"] span span, [data-testid="User-Name"] span span');
      const accountName = nameElement ? nameElement.textContent.trim() : '';
      
      // Get tweet text
      const textElement = article.querySelector('div[data-testid="tweetText"], [lang] div[dir="auto"], div[lang]');
      const tweetText = textElement ? textElement.textContent.trim() : '';
      
      // Get timestamp
      const timeElement = article.querySelector('time');
      const timestamp = timeElement ? (timeElement.getAttribute('datetime') || timeElement.textContent.trim()) : '';
      
      // Get tweet id
      let tweetId = null;
      let handle = null;
      const statusLink = article.querySelector('a[href*="/status/"]');
      if (statusLink) {
        const match = statusLink.href.match(/status\/(\d+)/);
        if (match) tweetId = match[1];
        
        // Extract @
        const handleMatch = statusLink.href.match(/\/([^\/]+)\/status\//);
        if (handleMatch) handle = '@' + handleMatch[1];
      }
      
      // Extract verification status
      const verifiedElement = article.querySelector('[data-testid="icon-verified"]');
      const isVerified = !!verifiedElement;
      
      // Check for government/politics tag
      const governmentElement = article.querySelector('[data-testid="icon-government"], [data-testid="icon-politics"], [aria-label*="Government"], [aria-label*="Politics"]');
      const isGovernment = !!governmentElement;
      
      // Check for company/brand tag
      const companyElement = article.querySelector('[data-testid="icon-business"], [data-testid="icon-brand"], [aria-label*="Business"], [aria-label*="Brand"], [aria-label*="Company"]');
      const isCompany = !!companyElement;
      
      // Get engagement metrics
      let likeCount = 0;
      let commentCount = 0;
      let retweetCount = 0;
      
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
      
      // Only return data if we have tweet text, since most necessary info is in the text
      if (tweetText) {
        const data = {
          id: tweetId || '',
          displayName: accountName || '',
          handle: handle || '',
          text: tweetText,
          timestamp: timestamp || '',
          isVerified: isVerified || null,
          isGovernment: isGovernment || null,
          isCompany: isCompany || null,
          likeCount: likeCount || null,
          commentCount: commentCount || null,
          retweetCount: retweetCount || null,
        };
        
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
    // Prefer adding near the username block to avoid layout shifts
    let anchor = article.querySelector('div[data-testid="User-Name"]');

    // InflammatoryRating indicator
    if (!article.querySelector('.xfi-indicator')) {
      const indicator = document.createElement('span');
      indicator.className = 'xfi-indicator pending';
      indicator.textContent = `...`;
      if (anchor) {
        anchor.appendChild(indicator);
      } else {
        article.appendChild(indicator);
        article.classList.add('xfi-article-fallback');
      }
    }

    // Ideology indicator
    if (!article.querySelector('.xfi-ideology')) {
      const ideo = document.createElement('span');
      ideo.className = 'xfi-ideology pending';
      ideo.textContent = `...`;
      if (anchor) {
        anchor.appendChild(ideo);
      } else {
        article.appendChild(ideo);
        article.classList.add('xfi-article-fallback');
      }
    }

    article.setAttribute(PROCESSED_ATTR, "true");
  }

  function processArticle(article) {
    if (!article) return;
    const data = extractTweetData(article);
    ensureIndicator(article, data);
    if (!data) return;
    
    // Skip if already processed using tweet ID
    if (data.id && processedTweets.has(data.id)) {
      const cached = processedTweets.get(data.id);
      enqueue(() => {
        if (typeof cached === 'number') {
          setIndicatorLevel(article, cached, 0);
        } else if (cached && typeof cached === 'object') {
          setIndicatorLevel(article, cached.level, 0);
          setIdeologyIndicator(article, cached.ideology);
        }
      });
    };
    
    // Enqueue classification only when text is available and not already done/pending
    const state = article.getAttribute(STATE_ATTR);
    if (config.enabled && data.text && state !== 'done' && state !== 'pending') {
      // mark pending immediately to avoid duplicated enqueues
      article.setAttribute(STATE_ATTR, 'pending');
      const ind = article.querySelector('.xfi-indicator');
      if (ind) ind.classList.add('pending');
      const ideo = article.querySelector('.xfi-ideology');
      if (ideo) ideo.classList.add('pending');
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
      ind.textContent = `INF ${level}`;
      article.setAttribute('data-xfi-rating', String(level));
      article.setAttribute('data-xfi-state', 'done');
    } else {
      ind.classList.add('error');
      ind.textContent = `INF ?`;
      article.setAttribute('data-xfi-state', 'error');
    }
    
    // Get tweet ID and add to cache if not already processed
    const data = extractTweetData(article);
    const tweetId = data?.id;
    if (tweetId && !processedTweets.has(tweetId)) {
      addToCache(tweetId, level);
    }
    maybeShowCleanserOverlay();
  }

  function setIdeologyIndicator(article, ideology) {
    const el = article.querySelector('.xfi-ideology');
    if (!el) return;
    el.classList.remove('pending', 'error', 'ideology--10', 'ideology--2', 'ideology--1', 'ideology-0', 'ideology-1', 'ideology-2');
    if (typeof ideology === 'number' && ((ideology >= -2 && ideology <= 2) || ideology == -10)) {
      const cls = `ideology-${ideology}`; // e.g., ideology--1, ideology-0, ideology-2
      el.classList.add(cls);
      if (ideology == -2) el.textContent = `LEFT`;
      else if (ideology == -1) el.textContent = `CL`;
      else if (ideology == 0) el.textContent = `CNTR`;
      else if (ideology == 1) el.textContent = `CR`;
      else if (ideology == 2) el.textContent = `RIGHT`;
      else el.textContent = `IDEO ${ideology}`;
      article.setAttribute(IDEOLOGY_ATTR, String(ideology));
    } else {
      el.classList.add('error');
      el.textContent = `IDEO ?`;
    }
  }

  async function classifyArticle(article, data) {
    if (!data?.text || data?.text == "") return;
    if (article.getAttribute('data-xfi-state') === 'done') return;
    const wordCount = (data.text ? data.text.trim().split(/\s+/).filter(Boolean).length : 0);
    try {
      // Avoid duplicate work
      const existing = parseInt(article.getAttribute('data-xfi-rating') || '', 10);
      const existingIdeo = parseInt(article.getAttribute(IDEOLOGY_ATTR) || '', 10);
      if ((existing >= 1 && existing <= 5) && ((existingIdeo >= -2 && existingIdeo <= 2) || existingIdeo == -10)) {
        setIndicatorLevel(article, existing, wordCount);
        setIdeologyIndicator(article, existingIdeo);
        return;
      }
      
      const res = await chrome.runtime.sendMessage({
        type: 'ANTHROPIC_CLASSIFY',
        payload: { text: data.text, model: 'claude-3-7-sonnet-20250219', fullData: data},
      });
      if (res?.error) {
        log('Classification error', res.error);
        setIndicatorLevel(article, null, wordCount);
        setIdeologyIndicator(article, null);
        return;
      }
      const rating = res?.rating;
      const ideology = res?.ideology;
      setIndicatorLevel(article, rating, wordCount);
      setIdeologyIndicator(article, ideology);

      // Cache by tweet ID if available to avoid unnecessary reclassification
      const tweetId = data?.id;
      if (tweetId) {
        processedTweets.set(tweetId, { level: rating, ideology });
      }
      maybeShowCleanserOverlay();
    } catch (e) {
      log('Classification exception', e);
      setIndicatorLevel(article, null, wordCount);
      setIdeologyIndicator(article, null);
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
      const { xfiEnabled = true, numberbound = 40, scorebound = 3.5 } = await chrome.storage.local.get(['xfiEnabled', 'numberbound', 'scorebound']);
      config.enabled = !!xfiEnabled;
      config.numberbound = numberbound;
      config.scorebound = scorebound;
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.xfiEnabled) {
          config.enabled = !!changes.xfiEnabled.newValue;
        }
        if (area == 'local' && changes.numberbound) {
          config.numberbound = changes.numberbound.newValue;
        }
        if (area == 'local' && changes.scorebound) {
          config.scorebound = changes.scorebound.newValue;
        }
      });
    } catch (e) {
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

  let cleanserShown = false;
  let cleanserHost = null;

  function computeStats() {
    let count = 0;
    let sum = 0;
    for (const [, v] of processedTweets.entries()) {
      let lvl = null;
      if (typeof v === 'number') lvl = v;
      else if (v && typeof v === 'object' && typeof v.level === 'number') lvl = v.level;
      if (typeof lvl === 'number' && lvl >= 1 && lvl <= 5) {
        count++;
        sum += lvl;
      }
    }
    const avg = count ? (sum / count) : 0;
    return { count, avg };
  }

  function maybeShowCleanserOverlay() {
    if (cleanserShown) return;
    const { count, avg } = computeStats();
    if (count > config.numberbound && avg > config.scorebound) {
      try { openCleanserOverlay(); } catch (e) {}
    }
  }

  function startRandomAudio() {
    try {
      // Avoid restarting if already playing
      if (this.currentAudio && !this.currentAudio.paused) return;
      const randomAudio = this.audioFiles[Math.floor(Math.random() * this.audioFiles.length)];
      // randomAudio entries already include the 'audio/' prefix
      const audioUrl = chrome.runtime.getURL(randomAudio);
      this.currentAudio = new Audio(audioUrl);
      this.currentAudio.volume = 0.4;
      this.currentAudio.loop = true;
      this.currentAudio.play().catch(e => console.log('Audio autoplay blocked:', e));
    } catch (error) {
      console.error('Failed to load audio:', error);
    }
  }
    
  function stopAudio() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
  }

  function openCleanserOverlay() {
    if (cleanserShown) return;
    cleanserShown = true;
    const host = document.createElement('div');
    host.id = 'xfi-cleanser-root';
    host.style.position = 'fixed';
    host.style.zIndex = '2147483647';
    host.style.inset = '0';
    host.style.pointerEvents = 'none';
    document.documentElement.appendChild(host);
    cleanserHost = host;

    if (audioFiles.length == 0) for (let i = 1; i <= 2; i++) {
      this.audioFiles.push(`audio/music${i}.mp3`);
    }
    stopAudio()
    startRandomAudio()

    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.8); backdrop-filter: blur(6px); pointer-events: auto; }
      .card { width: min(92vw, 520px); border-radius: 16px; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; box-shadow: 0 20px 40px rgba(0,0,0,0.3); position: relative; }
      .row { display: flex; gap: 12px; justify-content: center; margin-top: 12px; }
      .title { font-size: 22px; font-weight: 800; margin: 6px 0 8px; text-align: center; }
      .msg { text-align: center; opacity: 0.9; }
      .btn { padding: 12px 16px; border: 0; border-radius: 999px; font-weight: 700; cursor: pointer; color: #fff; }
      .break { background: linear-gradient(45deg, #ff6b6b, #ff8e8e); }
      .cleanse { background: linear-gradient(45deg, #4ecdc4, #6bcf7e); }
      .timer { display:none; text-align:center; }
      .timer.active { display:block; }
      .time { font-size: 36px; font-weight: 800; margin: 8px 0; }
      .bar { height:8px; background: rgba(255,255,255,0.25); border-radius: 4px; overflow: hidden; }
      .fill { height: 100%; background: linear-gradient(45deg, #ff6b6b, #4ecdc4); width: 0%; transition: width 0.1s ease; }
      .close { position:absolute; top:8px; right:12px; background:none; border:none; color:#fff; font-size:20px; cursor:pointer; }
    `;
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.innerHTML = `
      <div class="card">
        <div class="title">Woah, Slow Down! It's time for a sanity check!</div>
        <div class="msg">Consider a break or cleanse highly inflammatory items from your feed. Get some coffee, talk to a friend, or go outside!</div>
        <div class="row">
          <button class="btn break">OK - Take 3 Min Break</button>
          <button class="btn cleanse">Yes - Cleanse Feed</button>
        </div>
        <div class="timer" id="xfi-timer">
          <div class="time" id="xfi-time">3:00</div>
          <div class="bar"><div class="fill" id="xfi-fill"></div></div>
          <div style="opacity:.9;margin-top:8px;" id="xfi-zen">Step away from the screen and breathe...</div>
        </div>
      </div>
    `;
    shadow.appendChild(style);
    shadow.appendChild(wrap);

    const btnBreak = shadow.querySelector('.break');
    const btnCleanse = shadow.querySelector('.cleanse');
    const btnClose = shadow.querySelector('.close');
    const timer = shadow.getElementById('xfi-timer');
    const timeEl = shadow.getElementById('xfi-time');
    const fill = shadow.getElementById('xfi-fill');
    const zen = shadow.getElementById('xfi-zen');

    let total = 180; // 3 minutes
    let left = total;
    let t1 = null, t2 = null;
    function fmt(sec){ const m=Math.floor(sec/60), s=sec%60; return `${m}:${String(s).padStart(2,'0')}`; }
    function update(){ left--; if (timeEl) timeEl.textContent = fmt(left); if (fill) fill.style.width = `${((total-left)/total)*100}%`; if (left<=0) finish(); }
    function finish(){ if (t1) clearInterval(t1); if (t2) clearInterval(t2); close(); }
    function close(){ try { cleanserHost?.remove(); } catch(_){} }

    btnClose?.addEventListener('click', close);
    btnBreak?.addEventListener('click', () => {
      if (!timer) return;
      timer.classList.add('active');
      t1 = setInterval(update, 1000);
      t2 = setInterval(() => { if (zen) zen.textContent = randomZen(); }, 20000);
    });
    btnCleanse?.addEventListener('click', async () => {
      try { btnCleanse.textContent = 'Cleansing...'; btnCleanse.disabled = true; } catch(_){ }
      try {
        const targets = buildHighRiskTargets();
        if (Array.isArray(targets) && targets.length && window.discourager && typeof window.discourager.markTweetsNotInterested === 'function') {
          await window.discourager.markTweetsNotInterested(targets);
        }
        try { 
          btnCleanse.textContent = 'Feed Cleansed!';
          stopAudio()
         } catch(_){ }
        setTimeout(() => { try { cleanserHost?.remove(); } catch(_){ } }, 1200);
      } catch (e) {
        try { btnCleanse.textContent = 'Error'; } catch(_){ }
        setTimeout(() => { try { cleanserHost?.remove(); } catch(_){ } }, 1200);
      }
    });

    function buildHighRiskTargets(){
      const out = [];
      for (const [id, v] of processedTweets.entries()) {
        if (!id) continue;
        let lvl = null;
        if (typeof v === 'number') lvl = v; else if (v && typeof v === 'object') lvl = v.level;
        if (typeof lvl === 'number' && lvl >= 4) out.push({ id });
      }
      return out;
    }

    function randomZen(){
      const list = [
        'Step away from the screen and breathe...',
        'Feel the sunlight on your skin...',
        'Listen to the birds singing...',
        'Notice the world around you...'
      ];
      return list[Math.floor(Math.random()*list.length)];
    }
  }

  // Expose processed tweet data to popup via messaging
  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || !message.type) return;
      if (message.type === 'XFI_GET_PROCESSED') {
        const items = [];
        for (const [id, val] of processedTweets.entries()) {
          if (!id) continue;
          if (typeof val === 'number') {
            items.push({ id, rating: val, ideology: null });
          } else if (val && typeof val === 'object') {
            items.push({ id, rating: val.level, ideology: val.ideology });
          }
        }
        sendResponse({ ok: true, items });
        processedTweets.clear()
        return true;
      }
    });
  } catch (e) {}

})();
