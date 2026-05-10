import { GoogleGenAI, Type } from "@google/genai";
import { RedditPost, ExtractionResult } from "../../../../../Downloads/reddit-consensus-engine (6)/src/types.ts";

const getAIClient = () => {
  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined. Please check your environment variables or AI Studio Secrets.");
  }
  
  // Remove any unintentional quotes, whitespace, or hidden characters (BOM, etc.)
  apiKey = apiKey.trim().replace(/^["']|["']$/g, "").replace(/[^\x21-\x7E]/g, "");
  
  // Validation: Google API keys usually start with AIza
  if (!apiKey.startsWith("AIza")) {
    console.warn(`GEMINI_API_KEY warning: Key starts with "${apiKey.substring(0, 4)}...", which is unusual (expected "AIza").`);
  }
  
  return new GoogleGenAI({ apiKey });
};

export async function findRedditThreads(query: string): Promise<string[]> {
  const ai = getAIClient();
  const prompt = `Search for the top 10 most relevant and recent Reddit threads discussing product recommendations, reviews, or "best of" lists for: "${query}". 
  I need the direct URLs to the Reddit posts (e.g., https://www.reddit.com/r/subreddit/comments/id/title/).
  Focus on subreddits known for high-quality discussions (e.g., r/BuyItForLife, r/technology, or niche product subreddits).
  Use the googleSearch tool to find these specific discussion threads. 
  IMPORTANT: You MUST provide the full URLs to the Reddit threads in your response. Do not just summarize.
  Format your response as a simple list of URLs, one per line.`;

  const timeoutPromise = new Promise<string[]>((resolve) => 
    setTimeout(() => {
      console.warn(`Timeout finding threads via Google Search grounding for query: ${query} (90s)`);
      resolve([]);
    }, 90000)
  );

  const searchPromise = (async () => {
    try {
      console.log(`Finding Reddit threads for: ${query}`);
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text || "";
      console.log("Gemini search response text:", text);
      
      const urls: string[] = [];

      // 1. Extract from grounding metadata (most reliable for search)
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      if (groundingMetadata?.groundingChunks) {
        groundingMetadata.groundingChunks.forEach((chunk: any) => {
          if (chunk.web?.uri && chunk.web.uri.includes("reddit.com/r/")) {
            urls.push(chunk.web.uri);
          }
        });
      }

      // 2. Extract from text using regex
      const redditRegex = /https?:\/\/(?:[a-z0-9-]+\.)?reddit\.com\/r\/[^\s\)\n\r,<>"]+/g;
      const matches = text.match(redditRegex) || [];
      matches.forEach(m => urls.push(m));

      // 3. Clean and deduplicate
      const cleanUrls = [...new Set(urls.map(u => 
        u.replace(/[.\/!?,;:]+$/, "")
         .replace(/[)]+$/, "")
         .replace(/\\/g, "")
         .replace(/&amp;/g, "&")
      ))].filter(u => u.includes("reddit.com/r/") && (u.includes("/comments/") || u.split("/").length > 5));

      console.log(`Found ${cleanUrls.length} Reddit threads for query: ${query}`, cleanUrls);
      return cleanUrls.slice(0, 10);
    } catch (error) {
      console.error("Error finding Reddit threads:", error);
      throw error;
    }
  })();

  return Promise.race([searchPromise, timeoutPromise]);
}

export async function extractProductInsights(query: string, posts: RedditPost[], urls: string[] = []): Promise<ExtractionResult> {
  const ai = getAIClient();
  
  // Combine scraped posts (if any) with raw URLs for Gemini to fetch directly
  const contextText = posts.map(post => {
    const commentsText = post.comments.map(c => `[Comment by ${c.author}]: ${c.body}`).join("\n");
    return `Title: ${post.title}\nContent: ${post.selftext}\nComments:\n${commentsText}`;
  }).join("\n\n---\n\n");

  const prompt = `
    You are a product research assistant. Analyze the community discussions about "${query}" on Reddit.
    
    ${urls.length > 0 ? `I have provided several Reddit threads via the urlContext tool: ${urls.join(", ")}.` : ""}
    ${posts.length > 0 ? "I also have some pre-scraped post content provided below." : ""}

    Extract a list of specific products, brands, or models discussed. For each item:
    1. Identify the product/brand name clearly.
    2. Estimate the total number of mentions/recommendations this product received.
    3. Find the Amazon ASIN (Product ID) for this specific product. 
       - Use the googleSearch tool with the query: 'site:amazon.com "EXACT PRODUCT NAME"'.
       - Only extract the ASIN if you find a direct Amazon.com product page.
       - DO NOT hallucinate. Accuracy is critical.
    4. Determine the overall sentiment (positive, negative, or neutral).
    5. List key pros and cons mentioned by the community.
    6. Provide 1-2 representative quotes.

    Find at least 5 specific product recommendations that appear frequently.
    
    ${posts.length > 0 ? `Pre-scraped Context:\n${contextText.slice(0, 20000)}` : ""}
  `;

  const timeoutPromise = new Promise<ExtractionResult>((resolve) => 
    setTimeout(() => {
      console.warn(`Timeout extracting product insights for query: ${query} (120s)`);
      resolve({ products: [] });
    }, 120000)
  );

  const extractionPromise = (async () => {
    try {
      console.log(`Extracting product insights for: ${query}. (URLs to fetch: ${urls.length}, Scraped: ${posts.length})`);
      
      const tools: any[] = [{ googleSearch: {} }];
      if (urls.length > 0) {
        tools.push({ urlContext: {} });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              products: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    mentionCount: { type: Type.NUMBER },
                    asin: { type: Type.STRING },
                    sentiment: { type: Type.STRING, enum: ["positive", "negative", "neutral"] },
                    pros: { type: Type.ARRAY, items: { type: Type.STRING } },
                    cons: { type: Type.ARRAY, items: { type: Type.STRING } },
                    quotes: { 
                      type: Type.ARRAY, 
                      items: { 
                        type: Type.OBJECT,
                        properties: {
                          text: { type: Type.STRING },
                          sourceUrl: { type: Type.STRING }
                        },
                        required: ["text"]
                      } 
                    },
                  },
                  required: ["name", "mentionCount", "sentiment", "pros", "cons", "quotes"],
                },
              },
            },
            required: ["products"],
          },
        },
      });

      const text = response.text || '{"products": []}';
      console.log("Extraction raw response text:", text);
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      
      const result = JSON.parse(jsonStr);
      console.log(`Extracted ${result.products?.length || 0} products`);
      return result as ExtractionResult;
    } catch (error) {
      console.error("Extraction error:", error);
      throw error;
    }
  })();

  return Promise.race([extractionPromise, timeoutPromise]);
}

export async function generateSummary(query: string, extraction: ExtractionResult): Promise<string> {
  const ai = getAIClient();
  const prompt = `
    Summarize the Reddit consensus for the query: "${query}".
    
    STRICT GROUNDING RULES:
    1. ONLY use the following extracted insights.
    2. DO NOT use your own internal knowledge about these products.
    3. If the insights are empty, explain that no specific product recommendations were found in the analyzed discussions.
    
    Insights:
    ${JSON.stringify(extraction.products)}

    Write a concise, trustworthy summary (2-3 sentences).
  `;

  const timeoutPromise = new Promise<string>((resolve) => 
    setTimeout(() => {
      console.warn("Timeout generating summary");
      resolve("The analysis took longer than expected. Please check the ranked list below for details.");
    }, 15000)
  );

  const summaryPromise = (async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      return response.text || "No summary available.";
    } catch (error) {
      console.error("Summary error:", error);
      throw error;
    }
  })();

  return Promise.race([summaryPromise, timeoutPromise]);
}
