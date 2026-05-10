import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

// Load environment variables IMMEDIATELY
dotenv.config();

// Debug: Check if key is loaded and not a placeholder
const rawKey = process.env.GEMINI_API_KEY;
if (rawKey) {
  // Sanitize for logging and verification
  const sanitized = rawKey.trim().replace(/^["']|["']$/g, "").replace(/[^\x21-\x7E]/g, "");

  if (sanitized === "MY_GEMINI_API_KEY" || sanitized === "") {
    console.warn("CRITICAL: GEMINI_API_KEY is a placeholder or empty. Please set it in the AI Studio Secrets panel.");
  } else if (!sanitized.startsWith("AIza")) {
    console.warn(`CRITICAL: GEMINI_API_KEY does not start with 'AIza'. It might be invalid or have hidden characters. (Prefix: "${sanitized.substring(0, 4)}", Length: ${sanitized.length})`);
  } else {
    console.log(`GEMINI_API_KEY initialized (Length: ${sanitized.length}, Prefix: ${sanitized.substring(0, 10)}...)`);
  }
} else {
  console.warn("CRITICAL: GEMINI_API_KEY is missing from process.env");
}

import { fetchRedditThreadContent } from "./src/lib/reddit";
import { prisma } from "./src/lib/prisma";
import { findRedditThreads, extractProductInsights, generateSummary } from "./src/lib/extraction";
import { RedditPost } from "./src/types";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust proxy for express-rate-limit to work in AI Studio (which is behind a proxy)
  app.set('trust proxy', 1);

  // Request Logger
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  app.use(express.json({ limit: '10mb' }));

  // General API Rate limiter
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per 15 minutes
    message: { error: "Too many requests. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const forwarded = req.headers['x-forwarded-for'];
      return Array.isArray(forwarded) ? forwarded[0] : (forwarded as string) || req.ip || "unknown";
    }
  });

  // Strict rate limiter for AI operations
  const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20, // Expensive AI/Grounding operations
    message: { error: "Too many AI research requests. Please try again in 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const forwarded = req.headers['x-forwarded-for'];
      return Array.isArray(forwarded) ? forwarded[0] : (forwarded as string) || req.ip || "unknown";
    }
  });

  // API Routes Group
  const apiRouter = express.Router();
  apiRouter.use(apiLimiter);

  // Health check
  apiRouter.get("/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  // AI Research Routes
  apiRouter.post("/research/threads", aiLimiter, async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required" });
    try {
      const urls = await findRedditThreads(query);
      return res.json({ urls });
    } catch (error: any) {
      console.error("AI Thread Research error:", error);
      const message = error?.message || "Failed to find discussion threads.";
      return res.status(500).json({ error: message });
    }
  });

  apiRouter.post("/research/insights", aiLimiter, async (req, res) => {
    const { query, posts, urls } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required" });
    try {
      const extraction = await extractProductInsights(query, posts || [], urls || []);
      return res.json(extraction);
    } catch (error: any) {
      console.error("AI Insight Extraction error:", error);
      const message = error?.message || "Failed to extract product insights.";
      return res.status(500).json({ error: message });
    }
  });

  apiRouter.post("/research/summary", aiLimiter, async (req, res) => {
    const { query, extraction } = req.body;
    if (!query || !extraction) return res.status(400).json({ error: "Query and extraction are required" });
    try {
      const summary = await generateSummary(query, extraction);
      return res.json({ summary });
    } catch (error: any) {
      console.error("AI Summary generation error:", error);
      const message = error?.message || "Failed to generate summary.";
      return res.status(500).json({ error: message });
    }
  });

  // DB Cache Routes
  apiRouter.get("/cache-lookup", async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== "string") {
      return res.status(400).json({ error: "Query is required" });
    }

    const normalizedQuery = q.toLowerCase().trim();

    try {
      const cached = await prisma.searchQuery.findUnique({
        where: { query: normalizedQuery },
      });

      if (cached && cached.results && (Date.now() - new Date(cached.updatedAt).getTime() < 1000 * 60 * 60 * 24 * 3)) {
        console.log(`Cache hit for: ${normalizedQuery}`);
        return res.json(cached.results);
      }
      return res.status(404).json({ error: "Not found in cache" });
    } catch (error) {
      console.error("Cache lookup error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  apiRouter.post("/cache-result", async (req, res) => {
    const { query, result } = req.body;
    if (!query || !result) {
      return res.status(400).json({ error: "Query and result are required" });
    }

    const normalizedQuery = query.toLowerCase().trim();

    try {
      await prisma.searchQuery.upsert({
        where: { query: normalizedQuery },
        update: { results: result, updatedAt: new Date() },
        create: { query: normalizedQuery, normalizedQuery, results: result },
      });
      return res.json({ success: true });
    } catch (error) {
      console.error("Cache save error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  apiRouter.post("/reddit-content", async (req, res) => {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: "URLs array is required" });
    }

    try {
      const posts = await Promise.all(urls.map(url => fetchRedditThreadContent(url)));
      return res.json({ posts: posts.filter(p => p !== null) });
    } catch (error) {
      console.error("Reddit content proxy error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Catch-all for /api routes to prevent falling through to SPA HTML
  apiRouter.use((req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
  });

  // Mount API Router
  app.use("/api", apiRouter);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
