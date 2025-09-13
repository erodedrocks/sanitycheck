// Feed Cleanser Popup logic integrated with discourager + content scripts

(function(){
  class FeedCleanserPopup {
    constructor() {
      this.totalTime = 180; // seconds
      this.timeLeft = this.totalTime;
      this.timer = null;
      this.currentAudio = null;
      this.audioFiles = [];
      for (let i = 1; i <= 15; i++) {
        this.audioFiles.push(`audio/jazz${i}.mp3`);
      }
      this.zenMessages = [
        'Step away from the screen and breathe...',
        'Feel the sunlight on your skin...',
        'Listen to the birds singing...',
        'Notice the world around you...',
        'Your mind is clearing...',
        'Disconnect to reconnect...',
        'Nature is calling your name...',
        'Peace is found in stillness...',
        'Your soul is recharging...',
        'Almost time to return refreshed...'
      ];
      this.progressTimer = null;
      this.init();
    }

    startRandomAudio() {
      try {
        const randomAudio = this.audioFiles[Math.floor(Math.random() * this.audioFiles.length)];
        const audioUrl = chrome.runtime.getURL(`audio/${randomAudio}`);
        this.currentAudio = new Audio(audioUrl);
        this.currentAudio.volume = 0.4;
        this.currentAudio.loop = true;
        this.currentAudio.play().catch(e => console.log('Audio autoplay blocked:', e));
      } catch (error) {
        console.error('Failed to load audio:', error);
      }
    }
    
    stopAudio() {
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio = null;
      }
    }

    init() {
      const breakBtn = document.getElementById('breakBtn');
      const cleanseBtn = document.getElementById('cleanseBtn');
      breakBtn?.addEventListener('click', () => this.startBreakTimer());
      cleanseBtn?.addEventListener('click', () => this.cleanseFeed());
      this.startRandomAudio();
    }

    startBreakTimer() {
      const warning = document.getElementById('warningScreen');
      const timerScreen = document.getElementById('timerScreen');
      if (!warning || !timerScreen) return;
      warning.style.display = 'none';
      timerScreen.classList.add('active');
      this.timer = setInterval(() => this.updateTimer(), 1000);
      this.progressTimer = setInterval(() => this.updateZenMessage(), 20000);
    }

    updateTimer() {
      this.timeLeft--;
      const minutes = Math.floor(this.timeLeft / 60);
      const seconds = this.timeLeft % 60;
      const displayTime = `${minutes}:${String(seconds).padStart(2, '0')}`;
      const timerDisplay = document.getElementById('timerDisplay');
      const progressFill = document.getElementById('progressFill');
      if (timerDisplay) timerDisplay.textContent = displayTime;
      if (progressFill) {
        const progress = ((this.totalTime - this.timeLeft) / this.totalTime) * 100;
        progressFill.style.width = `${progress}%`;
      }
      if (this.timeLeft <= 0) this.completeBreak();
    }

    updateZenMessage() {
      const el = document.getElementById('zenMessage');
      if (!el) return;
      el.textContent = this.zenMessages[Math.floor(Math.random() * this.zenMessages.length)];
    }

    completeBreak() {
      if (this.timer) clearInterval(this.timer);
      if (this.progressTimer) clearInterval(this.progressTimer);
      const overlay = document.getElementById('popupOverlay');
      if (overlay) overlay.style.opacity = '0.9';
      this.stopAudio();
      setTimeout(() => window.close(), 500);
    }

    async cleanseFeed() {
      const btn = document.getElementById('cleanseBtn');
      if (btn) { btn.textContent = 'Cleansing...'; btn.setAttribute('disabled', 'true'); }
      try {
        this.stopAudio();
        const tab = await this.getActiveTwitterTab();
        if (!tab?.id) throw new Error('Open a Twitter/X tab to cleanse.');

        // Get processed tweets with ratings from content script
        const resp = await chrome.tabs.sendMessage(tab.id, { type: 'XFI_GET_PROCESSED' });
        const items = Array.isArray(resp?.items) ? resp.items : [];
        const high = items.filter((t) => (t?.rating ?? 0) >= 4).map((t) => ({ id: t.id }));

        if (high.length === 0) {
          if (btn) btn.textContent = 'No content to cleanse';
          setTimeout(() => window.close(), 1200);
          return;
        }

        // Ask discourager (in content world) to mark not interested
        await chrome.tabs.sendMessage(tab.id, {
          type: 'DISCOURAGER_MARK_NOT_INTERESTED',
          payload: { targets: high },
        });

        if (btn) btn.textContent = '✅ Feed Cleansed!';
        setTimeout(() => window.close(), 1500);
      } catch (e) {
        console.warn('[Popup] Cleanse error', e);
        if (btn) btn.textContent = 'Error';
        setTimeout(() => window.close(), 1200);
      }
    }

    async getActiveTwitterTab() {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs?.[0];
      if (!tab?.url) return tab;
      try {
        const u = new URL(tab.url);
        if (/(^|\.)twitter\.com$/.test(u.hostname) || /(^|\.)x\.com$/.test(u.hostname)) return tab;
      } catch (_) {}
      return tab; // return anyway; content script may not be injected if not matching
    }
  }

  // Initialize popup
  new FeedCleanserPopup();
})();
