export type RedditPost = {
  id: string;
  title: string;
  selftext: string;
  url: string;
  score: number;
  num_comments: number;
  subreddit: string;
  comments: RedditComment[];
};

export type RedditComment = {
  id: string;
  body: string;
  score: number;
  author: string;
};

export type ExtractionResult = {
  products: {
    name: string;
    asin?: string;
    mentionCount: number;
    sentiment: "positive" | "negative" | "neutral";
    pros: string[];
    cons: string[];
    quotes: {
      text: string;
      sourceUrl?: string;
    }[];
  }[];
};

export type RankedProduct = {
  name: string;
  mentions: number;
  sentimentScore: number; // 0 to 1
  pros: string[];
  cons: string[];
  bestFor?: string;
  confidence: "high" | "medium" | "low";
  quotes: {
    text: string;
    sourceUrl?: string;
  }[];
  affiliateUrl?: string;
};

export type SearchResult = {
  query: string;
  summary: string;
  products: RankedProduct[];
  sources: {
    subreddit: string;
    count: number;
  }[];
};
