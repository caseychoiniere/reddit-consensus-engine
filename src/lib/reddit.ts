import { RedditPost, RedditComment } from "../types";

export async function fetchRedditThreadContent(url: string): Promise<RedditPost | null> {
  // Normalize URL to www.reddit.com for JSON fetching
  const baseRedditUrl = "https://www.reddit.com";
  const oldRedditUrl = "https://old.reddit.com";
  
  let normalizedUrl = url.replace(/^(https?:\/\/)?(?:old\.|m\.|new\.)?reddit\.com/, baseRedditUrl);
  
  // Ensure URL ends with .json
  const getJsonUrl = (baseUrl: string) => {
    const u = url.replace(/^(https?:\/\/)?(?:old\.|m\.|new\.)?reddit\.com/, baseUrl);
    return u.includes(".json") ? u : `${u.split('?')[0].replace(/\/$/, "")}.json`;
  };

  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  ];
  const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

  const fetchWithRetry = async (jsonUrl: string): Promise<Response | null> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      console.log(`Attempting to fetch Reddit content from: ${jsonUrl}`);
      const response = await fetch(jsonUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": randomUserAgent,
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
          "Referer": "https://www.reddit.com/",
        },
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      return null;
    }
  };

  try {
    // Try www.reddit.com first
    let response = await fetchWithRetry(getJsonUrl(baseRedditUrl));
    
    // If blocked or failed, try old.reddit.com
    if (!response || response.status === 403 || response.status === 429) {
      console.warn(`Blocked or failed on www.reddit.com (${response?.status}), trying old.reddit.com...`);
      response = await fetchWithRetry(getJsonUrl(oldRedditUrl));
    }

    if (!response || !response.ok) {
      console.warn(`Failed to fetch Reddit content after retries: ${response?.status} ${response?.statusText}`);
      return null;
    }

    const data = await response.json();
    
    // Basic validation of Reddit JSON structure
    if (!Array.isArray(data) || data.length < 2) {
      console.warn(`Unexpected JSON structure from ${url}`);
      return null;
    }

    const post = data[0]?.data?.children?.[0]?.data;
    if (!post) return null;

    const comments = (data[1]?.data?.children || [])
      .filter((c: any) => c.kind === "t1")
      .map((c: any) => ({
        id: c.data.id,
        body: c.data.body,
        score: c.data.score,
        author: c.data.author,
      }));

    return {
      id: post.id,
      title: post.title,
      selftext: post.selftext,
      url: `https://reddit.com${post.permalink}`,
      score: post.score,
      num_comments: post.num_comments,
      subreddit: post.subreddit,
      comments,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`Timeout fetching thread ${url}`);
    } else {
      console.error(`Error fetching thread ${url}:`, error);
    }
    return null;
  }
}
