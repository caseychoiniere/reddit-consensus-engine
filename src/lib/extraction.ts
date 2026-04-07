import { GoogleGenAI, Type } from "@google/genai";
import { RedditPost, ExtractionResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function findRedditThreads(query: string): Promise<string[]> {
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
      return [];
    }
  })();

  return Promise.race([searchPromise, timeoutPromise]);
}

export async function extractProductInsights(query: string, posts: RedditPost[], urls: string[] = []): Promise<ExtractionResult> {
  // Prepare text for extraction if we have posts
  const context = posts.map(post => {
    const commentsText = post.comments.map(c => `[Comment by ${c.author}]: ${c.body}`).join("\n");
    return `Title: ${post.title}\nContent: ${post.selftext}\nComments:\n${commentsText}`;
  }).join("\n\n---\n\n");

  const prompt = `
    You are a product research assistant. Analyze the Reddit discussions about "${query}".
    Extract a list of specific products, brands, or models mentioned in these discussions. For each item:
    1. Identify the product/brand name clearly (e.g., "Herman Miller Aeron", "Steelcase Leap V2").
    2. Estimate the total number of mentions this product received in the discussions.
    3. Find the Amazon ASIN (Product ID) for this specific product (e.g., B00141L18I). 
       - Use the googleSearch tool with the query: 'site:amazon.com "EXACT PRODUCT NAME"'.
       - Examine the search results carefully. Only extract the ASIN if you find a direct Amazon.com product page (e.g., amazon.com/dp/ASIN or amazon.com/name/dp/ASIN).
       - IMPORTANT: ONLY provide an ASIN if it is verified from a search result. 
       - If you cannot find a verified ASIN on the first page of results, leave the field empty. 
       - DO NOT hallucinate, guess, or use placeholders. 
       - Accuracy is more important than having an ASIN for every product.
    3. Determine the overall sentiment (positive, negative, or neutral).
    4. List key pros and cons mentioned by users.
    5. Provide 1-2 representative quotes from the text.

    Include any product that is discussed, even if it's just a brand name.
    Be inclusive but accurate to the text.
    
    ${posts.length > 0 ? "Use the provided context below for sentiment and quotes." : `Research the following Reddit threads for product recommendations regarding '${query}': ${urls.join(", ")}. 
    Use the googleSearch tool to find the community consensus for this query. 
    Find at least 5 specific product recommendations that appear frequently in Reddit discussions.`}

    ${posts.length > 0 ? `Context:\n${context.slice(0, 30000)}` : ""}
  `;

  const timeoutPromise = new Promise<ExtractionResult>((resolve) => 
    setTimeout(() => {
      console.warn(`Timeout extracting product insights for query: ${query} (90s)`);
      resolve({ products: [] });
    }, 90000) // Increased timeout for URL context and search
  );

  const extractionPromise = (async () => {
    try {
      console.log(`Extracting product insights for: ${query}. Posts: ${posts.length}, URLs: ${urls.length}`);
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
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
                    mentionCount: { type: Type.NUMBER, description: "Estimated number of times this product was mentioned in the discussions" },
                    asin: { type: Type.STRING, description: "The Amazon ASIN for the product (e.g., B0C65CMKTK)" },
                    sentiment: { type: Type.STRING, enum: ["positive", "negative", "neutral"] },
                    pros: { type: Type.ARRAY, items: { type: Type.STRING } },
                    cons: { type: Type.ARRAY, items: { type: Type.STRING } },
                    quotes: { type: Type.ARRAY, items: { type: Type.STRING } },
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
      return { products: [] };
    }
  })();

  return Promise.race([extractionPromise, timeoutPromise]);
}

export async function generateSummary(query: string, extraction: ExtractionResult): Promise<string> {
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
      return "Error generating summary.";
    }
  })();

  return Promise.race([summaryPromise, timeoutPromise]);
}
