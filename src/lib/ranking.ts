import { ExtractionResult, RankedProduct, RedditPost } from "../types";

export function rankProducts(extraction: ExtractionResult, posts: RedditPost[]): RankedProduct[] {
  const productMap = new Map<string, {
    mentions: number;
    sentimentSum: number;
    pros: Set<string>;
    cons: Set<string>;
    quotes: Map<string, { text: string; sourceUrl?: string }>;
    asin?: string;
  }>();

  // Aggregate from extraction
  extraction.products.forEach(p => {
    const key = p.name.toLowerCase();
    const existing = productMap.get(key) || {
      mentions: 0,
      sentimentSum: 0,
      pros: new Set(),
      cons: new Set(),
      quotes: new Map<string, { text: string; sourceUrl?: string }>(),
      asin: p.asin
    };

    existing.mentions += p.mentionCount || 1;
    existing.sentimentSum += (p.sentiment === "positive" ? 1 : p.sentiment === "negative" ? -1 : 0) * (p.mentionCount || 1);
    p.pros.forEach(pro => existing.pros.add(pro));
    p.cons.forEach(con => existing.cons.add(con));
    p.quotes.forEach(quote => {
      if (!existing.quotes.has(quote.text)) {
        existing.quotes.set(quote.text, quote);
      }
    });
    if (p.asin && !existing.asin) existing.asin = p.asin;

    productMap.set(key, existing);
  });

  const ranked: RankedProduct[] = Array.from(productMap.entries()).map(([name, data]) => {
    const sentimentScore = (data.sentimentSum / data.mentions + 1) / 2; // Normalize to 0-1
    
    // Default to a search link which is very reliable
    let affiliateUrl = `https://www.amazon.com/s?k=${encodeURIComponent(name)}&tag=choincstar-20`;
    
    // Validate ASIN format (10 alphanumeric characters, usually starting with B)
    // We also check if it's not just a placeholder or common hallucination
    const suspiciousAsins = ['ASINHERE', 'B000000000', 'B0XXXXXXXX', 'B012345678', 'B098765432'];
    const isValidAsin = data.asin && 
                       /^[A-Z0-9]{10}$/.test(data.asin) && 
                       !suspiciousAsins.includes(data.asin) &&
                       !/^(.)\1{9}$/.test(data.asin); // No 10 repeating characters
    
    if (isValidAsin) {
      // Use the standard DP link format. 
      // Adding the product name to the URL can sometimes help with SEO/redirection if the ASIN is slightly off,
      // but the most robust way is the direct /dp/ link.
      affiliateUrl = `https://www.amazon.com/dp/${data.asin}?tag=choincstar-20`;
    }
    
    return {
      name: name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      mentions: data.mentions,
      sentimentScore,
      pros: Array.from(data.pros).slice(0, 3),
      cons: Array.from(data.cons).slice(0, 3),
      quotes: Array.from(data.quotes.values()).slice(0, 3).map(q => ({
      ...q,
      sourceUrl: q.sourceUrl?.startsWith('http') ? q.sourceUrl : `https://www.reddit.com${q.sourceUrl?.startsWith('/') ? '' : '/'}${q.sourceUrl}`
    })),
      confidence: data.mentions >= 5 ? "high" : data.mentions >= 2 ? "medium" : "low",
      affiliateUrl
    };
  });

  // Sort by mentions and sentiment
  return ranked.sort((a, b) => (b.mentions * b.sentimentScore) - (a.mentions * a.sentimentScore));
}
