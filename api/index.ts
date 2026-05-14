import express from "express";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();

import { fetchRedditThreadContent } from "../src/lib/reddit.ts";
import { prisma } from "../src/lib/prisma.ts";
import {
    findRedditThreads,
    extractProductInsights,
    generateSummary,
} from "../src/lib/extraction.ts";

const app = express();

app.set("trust proxy", 1);
app.use(express.json({ limit: "10mb" }));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return (req.headers["x-forwarded-for"] as string) || req.ip || "unknown";
    },
});

const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: "Too many AI research requests. Please try again in 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return (req.headers["x-forwarded-for"] as string) || req.ip || "unknown";
    },
});

app.use(apiLimiter);

app.get("/", (_req, res) => {
    return res.status(200).json({ ok: true, service: "Reddit Suggests API" });
});

app.post("/research/threads", aiLimiter, async (req, res) => {
    const { query } = req.body;

    if (!query) {
        return res.status(400).json({ error: "Query is required" });
    }

    try {
        const urls = await findRedditThreads(query);
        return res.status(200).json({ urls });
    } catch (error) {
        console.error("AI Thread Research error:", error);
        return res.status(500).json({ error: "Failed to find discussion threads." });
    }
});

app.post("/research/insights", aiLimiter, async (req, res) => {
    const { query, posts, urls } = req.body;

    if (!query) {
        return res.status(400).json({ error: "Query is required" });
    }

    try {
        const extraction = await extractProductInsights(query, posts || [], urls || []);
        return res.status(200).json(extraction);
    } catch (error) {
        console.error("AI Insight Extraction error:", error);
        return res.status(500).json({ error: "Failed to extract product insights." });
    }
});

app.post("/research/summary", aiLimiter, async (req, res) => {
    const { query, extraction } = req.body;

    if (!query || !extraction) {
        return res.status(400).json({ error: "Query and extraction are required" });
    }

    try {
        const summary = await generateSummary(query, extraction);
        return res.status(200).json({ summary });
    } catch (error) {
        console.error("AI Summary generation error:", error);
        return res.status(500).json({ error: "Failed to generate summary." });
    }
});

app.get("/cache-lookup", async (req, res) => {
    const { q } = req.query;

    if (!q || typeof q !== "string") {
        return res.status(400).json({ error: "Query is required" });
    }

    const normalizedQuery = q.toLowerCase().trim();

    try {
        const cached = await prisma.searchQuery.findUnique({
            where: { query: normalizedQuery },
        });

        const isFresh =
            cached?.updatedAt &&
            Date.now() - new Date(cached.updatedAt).getTime() < 1000 * 60 * 60 * 24 * 3;

        if (cached?.results && isFresh) {
            return res.status(200).json(cached.results);
        }

        return res.status(404).json({ error: "Not found in cache" });
    } catch (error) {
        console.error("Cache lookup error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/cache-result", async (req, res) => {
    const { query, result } = req.body;

    if (!query || !result) {
        return res.status(400).json({ error: "Query and result are required" });
    }

    const normalizedQuery = query.toLowerCase().trim();

    try {
        await prisma.searchQuery.upsert({
            where: { query: normalizedQuery },
            update: {
                results: result,
                updatedAt: new Date(),
            },
            create: {
                query: normalizedQuery,
                normalizedQuery,
                results: result,
            },
        });

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Cache save error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/reddit-content", async (req, res) => {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ error: "URLs array is required" });
    }

    try {
        const posts = await Promise.all(
            urls.map((url: string) => fetchRedditThreadContent(url))
        );

        return res.status(200).json({
            posts: posts.filter((post) => post !== null),
        });
    } catch (error) {
        console.error("Reddit content proxy error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default app;
