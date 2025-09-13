class TwitterDiscourager {
  constructor() {
    this.init();
    this.processedTweets = new Set();
  }

  init() {
    // Wait for Twitter to load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupObserver());
    } else {
      this.setupObserver();
    }
  }

  setupObserver() {
    // Observe for new tweets being loaded
    const observer = new MutationObserver(() => {
      this.cacheTweetElements();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Initial setup
    this.cacheTweetElements();
  }

  cacheTweetElements() {
    // Just cache tweet elements, don't add buttons
    const tweets = document.querySelectorAll('article[data-testid="tweet"]:not([data-cached])');
    
    tweets.forEach(tweet => {
      tweet.setAttribute('data-cached', 'true');
    });
  }

  // Get tweet identifiers for building your target list
  getTweetIdentifiers() {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    const identifiers = [];

    tweets.forEach(tweet => {
      const identifier = this.extractTweetIdentifier(tweet);
      if (identifier) {
        identifiers.push({
          id: identifier.id,
          author: identifier.author,
          text: identifier.text,
          element: tweet
        });
      }
    });

    return identifiers;
  }

  extractTweetIdentifier(tweetElement) {
    try {
      // Method 1: Extract tweet ID from URL
      const timeElement = tweetElement.querySelector('time');
      const tweetLink = timeElement?.parentElement?.getAttribute('href');
      const tweetId = tweetLink?.match(/\/status\/(\d+)/)?.[1];

      // Method 2: Extract author username
      const authorElement = tweetElement.querySelector('[data-testid="User-Name"] a');
      const authorHandle = authorElement?.getAttribute('href')?.replace('/', '');

      // Method 3: Extract tweet text (first 100 chars for identification)
      const tweetTextElement = tweetElement.querySelector('[data-testid="tweetText"]');
      const tweetText = tweetTextElement?.textContent?.substring(0, 100);

      return {
        id: tweetId,
        author: authorHandle,
        text: tweetText
      };
    } catch (error) {
      console.error('Failed to extract tweet identifier:', error);
      return null;
    }
  }

  // Main function to discretely mark tweets as not interested
  async markTweetsNotInterested(targetList) {
    console.log(`Processing ${targetList.length} tweets discretely...`);
    
    for (let i = 0; i < targetList.length; i++) {
      const target = targetList[i];
      
      try {
        const tweetElement = this.findTweetElement(target);
        if (tweetElement && !this.processedTweets.has(target.id)) {
          await this.discretelyMarkNotInterested(tweetElement);
          this.processedTweets.add(target.id);
          
          // Small random delay to appear more natural
          await this.randomDelay(50, 150);
        }
      } catch (error) {
        console.error(`Failed to process tweet ${target.id}:`, error);
      }
    }
    
    console.log('Discrete processing complete');
  }

  findTweetElement(target) {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    
    for (const tweet of tweets) {
      const identifier = this.extractTweetIdentifier(tweet);
      
      if (identifier && (
        identifier.id === target.id ||
        (identifier.author === target.author && identifier.text === target.text)
      )) {
        return tweet;
      }
    }
    
    return null;
  }

  async discretelyMarkNotInterested(tweetElement) {
    return new Promise(async (resolve) => {
      try {
        const moreButton = tweetElement.querySelector('[data-testid="caret"]');
        if (!moreButton) {
          resolve(false);
          return;
        }

        // Click menu button discretely (no visual feedback)
        moreButton.click();
        
        // Wait and click "Not interested" option
        const success = await this.waitAndClickNotInterested();
        
        // No visual feedback - completely discrete
        resolve(success);
        
      } catch (error) {
        console.error('Discrete action failed:', error);
        resolve(false);
      }
    });
  }

  async waitAndClickNotInterested() {
    return new Promise((resolve) => {
      const maxAttempts = 8;
      let attempts = 0;

      const checkForMenu = () => {
        attempts++;
        
        const menuItems = document.querySelectorAll([
          '[role="menuitem"]',
          '[data-testid="Dropdown"] div[role="menuitem"]',
          'div[role="menu"] div[role="menuitem"]'
        ].join(', '));

        for (const item of menuItems) {
          const text = item.textContent || item.innerText || '';
          if (text.toLowerCase().includes('not interested') || 
              text.toLowerCase().includes('show fewer')) {
            item.click();
            resolve(true);
            return;
          }
        }

        if (attempts < maxAttempts) {
          setTimeout(checkForMenu, 75);
        } else {
          resolve(false);
        }
      };

      setTimeout(checkForMenu, 25);
    });
  }

  randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  // Utility function to help you build target lists
  getVisibleTweetsByKeyword(keyword) {
    const identifiers = this.getTweetIdentifiers();
    return identifiers.filter(tweet => 
      tweet.text?.toLowerCase().includes(keyword.toLowerCase()) ||
      tweet.author?.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  getVisibleTweetsByAuthor(authorHandle) {
    const identifiers = this.getTweetIdentifiers();
    return identifiers.filter(tweet => 
      tweet.author === authorHandle || tweet.author === `@${authorHandle}`
    );
  }
}

// Initialize the discourager
const discourager = new TwitterDiscourager();

// const targetTweetIds = ids;

// const targetList = targetTweetIds.filter(tuple => tuple[1] >= 4);

// // await discourager.markTweetsNotInterested(targetList);