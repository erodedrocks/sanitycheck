function extractTweets() {

    const tweets = [];

    const noDup = new Set();
    
    const articles = document.querySelectorAll('article[data-testid="tweet"], article[role="article"]');
    
    articles.forEach(article => {
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
        
        // Only add if we have tweet text and it's not a duplicate
        if (tweetText) {
          // Create a unique identifier for the tweet (use available data)
          const tweetId = `${accountName || 'unknown'}-${tweetText}-${timestamp || 'no-time'}`;
          
          if (!noDup.has(tweetId)) {
            noDup.add(tweetId);
            tweets.push({
              accountName: accountName || '',
              tweetText: tweetText,
              timestamp: timestamp || ''
            });
          }
        }
      } catch (error) {
        console.error('Error extracting tweet:', error);
      }
    });
    
    console.log(`Found ${articles.length} tweet articles`);
    console.log(`Extracted ${tweets.length} unique tweets`);
    console.log('Tweets:', tweets);
    
    return tweets;
  }