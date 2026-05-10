"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, ArrowLeft, ExternalLink, ThumbsUp, ThumbsDown, Quote, AlertCircle, Loader2, X, Scale, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SearchResult, RankedProduct, RedditPost } from "../types";
import { cn } from "../../../../../Downloads/reddit-consensus-engine (5)/src/lib/utils.ts";
import { rankProducts } from "../../../../../Downloads/reddit-consensus-engine (5)/src/lib/ranking.ts";
import { useAppContext } from "../../../../../Downloads/reddit-consensus-engine (5)/src/context/AppContext.tsx";
import ThemeToggle from "../../../../../Downloads/reddit-consensus-engine (5)/src/components/ThemeToggle.tsx";

function SearchResultsContent() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q");
  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Initializing...");
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<RankedProduct[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const { addSearch, searchCache } = useAppContext();
  const [searchInput, setSearchInput] = useState(query || "");

  useEffect(() => {
    setSearchInput(query || "");
  }, [query]);

  const handleNewSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim() && searchInput.trim() !== query) {
      navigate(`/search?q=${encodeURIComponent(searchInput.trim())}`);
    }
  };

  const toggleProductSelection = (product: RankedProduct) => {
    setSelectedProducts(prev => {
      const isSelected = prev.some(p => p.name === product.name);
      if (isSelected) {
        return prev.filter(p => p.name !== product.name);
      }
      if (prev.length >= 3) return prev; // Limit to 3 for comparison
      return [...prev, product];
    });
  };

  const [animationPhase, setAnimationPhase] = useState<'whip' | 'spin'>('whip');

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setAnimationPhase(prev => (prev === 'whip' ? 'spin' : 'whip'));
    }, 3000); // 3s whip (3 times) then 3s spin (3 times)
    return () => clearInterval(interval);
  }, [loading]);

  const loadingMessages = [
    "Finding the best Reddit threads...",
    "Reading through community discussions...",
    "Extracting product mentions and sentiment...",
    "Comparing features and user reviews...",
    "Ranking products based on community consensus...",
    "Synthesizing the final recommendations...",
    "Ensuring accuracy by cross-referencing sources...",
    "Filtering out the noise to find the signal...",
    "Building your personalized product guide...",
    "Almost there...",
    "Verifying search result accuracy"
  ];

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => {
        if (prev < loadingMessages.length - 2) {
          return prev + 1;
        }
        // Cycle between the last two messages once the initial list is exhausted
        return prev === loadingMessages.length - 2 ? loadingMessages.length - 1 : loadingMessages.length - 2;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [loading, loadingMessages.length]);

  useEffect(() => {
    if (!query) return;

    let isMounted = true;

    const fetchData = async () => {
      // Check cache first
      const cachedResult = searchCache[query.toLowerCase()];
      if (cachedResult) {
        setData(cachedResult);
        setLoading(false);
        addSearch(query); // Update recent searches order
        return;
      }

      // Reset state for new fetch
      setData(null);
      setError(null);
      setLoading(true);
      setStatus("Initializing...");

      // Timer for updating loading text after 8 seconds
      const loadingTimer = setTimeout(() => {
        if (isMounted) {
          setStatus("Searching millions of threads... this takes time but ensures accuracy.");
        }
      }, 8000);

      try {
        setStatus("Checking server cache...");
        const cacheRes = await fetch(`/api/cache-lookup?q=${encodeURIComponent(query)}`);
        if (cacheRes.ok && isMounted) {
          const cachedResult = await cacheRes.json();
          setData(cachedResult);
          setLoading(false);
          addSearch(query, cachedResult);
          return;
        }

        // 1. Find relevant Reddit threads using Google Search grounding
        setStatus("Finding relevant Reddit threads...");
        const threadsRes = await fetch("/api/research/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
        
        if (!threadsRes.ok) throw new Error("Failed to find Reddit threads");
        const { urls: threadUrls } = await threadsRes.json();
        
        console.log(`Step 1 complete: Found ${threadUrls.length} threads`);
        
        if (!isMounted) return;

        let posts: RedditPost[] = [];

        if (threadUrls.length > 0) {
          // 2. Fetch content for these specific threads via server proxy
          setStatus(`Fetching content from ${threadUrls.length} threads...`);
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const contentRes = await fetch("/api/reddit-content", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ urls: threadUrls }),
              signal: controller.signal,
            });
            
            clearTimeout(timeoutId);

            if (contentRes.ok && isMounted) {
              const contentData = await contentRes.json();
              posts = contentData.posts || [];
              console.log(`Step 2 complete: Successfully fetched ${posts.length} posts`);
            }
          } catch (e) {
            console.warn("Step 2 failed: Fetch content via proxy timed out or errored", e);
          }
        }

        if (!isMounted) return;

        // 3. If no threads found at all (and no content fetched)
        if (threadUrls.length === 0 && posts.length === 0) {
          const emptyResult: SearchResult = {
            query,
            summary: "No relevant Reddit discussions found for this query.",
            products: [],
            sources: []
          };
          setData(emptyResult);
          addSearch(query, emptyResult);
          setLoading(false);
          return;
        }

        // 4. Extract Insights
        setStatus(`Extracting product insights...`);
        const insightsRes = await fetch("/api/research/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, posts, urls: threadUrls }),
        });
        
        if (!insightsRes.ok) throw new Error("Failed to extract product insights");
        const extraction = await insightsRes.json();
        
        if (!isMounted) return;

        // 5. Rank Products
        setStatus("Ranking recommendations...");
        const rankedProducts = rankProducts(extraction, posts);

        // 6. Generate Summary
        setStatus("Synthesizing the final consensus...");
        const summaryRes = await fetch("/api/research/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, extraction }),
        });
        
        if (!summaryRes.ok) throw new Error("Failed to generate summary");
        const { summary } = await summaryRes.json();

        if (!isMounted) return;

        // 7. Aggregate Sources
        let sources: { subreddit: string; count: number }[] = [];
        if (posts.length > 0) {
          sources = Array.from(
            posts.reduce((acc, post) => {
              acc.set(post.subreddit, (acc.get(post.subreddit) || 0) + 1);
              return acc;
            }, new Map<string, number>())
          ).map(([subreddit, count]) => ({ subreddit, count }));
        } else {
          const subreddits = threadUrls.map(url => {
            const match = url.match(/\/r\/([a-zA-Z0-9._-]+)/);
            return match ? match[1] : "reddit";
          });
          const counts = subreddits.reduce((acc, sub) => {
            acc.set(sub, (acc.get(sub) || 0) + 1);
            return acc;
          }, new Map<string, number>());
          sources = Array.from(counts.entries()).map(([subreddit, count]) => ({ subreddit, count }));
        }

        const finalResult: SearchResult = {
          query,
          summary,
          products: rankedProducts,
          sources
        };

        setData(finalResult);
        addSearch(query, finalResult);

        // 8. Optional: Save to server cache (background)
        fetch("/api/cache-result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, result: finalResult }),
        }).catch(err => console.warn("Failed to cache result on server", err));

      } catch (err) {
        console.error("Search error:", err);
        if (isMounted) {
          if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('timeout'))) {
            setError("Analysis timed out. Community sentiment analysis can take time.");
          } else {
            setError("Something went wrong while analyzing Reddit discussions.");
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
        clearTimeout(loadingTimer);
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [query, addSearch]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg-primary)] transition-colors duration-300 overflow-hidden">
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative w-24 h-24 mb-8 flex items-center justify-center">
            <motion.div
              animate={{ rotate: animationPhase === 'spin' ? 360 : 0 }}
              transition={{
                rotate: animationPhase === 'spin' 
                  ? { duration: 1, repeat: Infinity, ease: "linear" }
                  : { duration: 0.5, ease: "easeOut" }
              }}
              className="relative w-full h-full flex items-center justify-center"
            >
              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  animate={animationPhase === 'whip' ? {
                    y: ["0%", "-150%", "0%"],
                    x: (i - 1.5) * 20,
                    scale: [1, 1.2, 1],
                  } : {
                    x: Math.cos((i * Math.PI) / 2) * 24,
                    y: Math.sin((i * Math.PI) / 2) * 24,
                    scale: 1,
                  }}
                  transition={animationPhase === 'whip' ? {
                    y: {
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: "easeInOut",
                    },
                    scale: {
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: "easeInOut",
                    },
                    x: { duration: 0.5 }
                  } : {
                    x: { duration: 0.5 },
                    y: { duration: 0.5 },
                    scale: { duration: 0.5 }
                  }}
                  className="absolute w-3.5 h-3.5 bg-orange-600 rounded-full shadow-lg shadow-orange-600/20"
                />
              ))}
            </motion.div>
          </div>
          <AnimatePresence mode="wait">
            <motion.h2 
              key={loadingMessageIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5 }}
              className="text-2xl font-bold mb-3 dark:text-white text-center"
            >
              {loadingMessages[loadingMessageIndex]}
            </motion.h2>
          </AnimatePresence>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-center max-w-md">
            {status}
          </p>
        </div>

        {/* Animated Skeletons */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30 dark:opacity-40">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ x: "-100%" }}
              animate={{ 
                x: "200%",
                opacity: [0.2, 0.5, 0.2]
              }}
              transition={{
                x: {
                  duration: 8,
                  repeat: Infinity,
                  delay: i * 1.5,
                  ease: "linear"
                },
                opacity: {
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }
              }}
              className="absolute h-32 w-full max-w-2xl bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-slate-600 rounded-3xl"
              style={{ 
                top: `${15 + i * 15}%`,
                left: i % 2 === 0 ? "-20%" : "20%"
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg-primary)] transition-colors duration-300">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2 dark:text-white">Error</h2>
        <p className="text-slate-500 dark:text-slate-200 mb-6">{error || "Could not load results."}</p>
        <button onClick={() => navigate("/")} className="text-orange-600 font-semibold flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans pb-24 transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate("/")} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-500 dark:text-slate-200" />
          </button>
          <form onSubmit={handleNewSearch} className="flex-1 relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl py-2 pl-10 pr-4 text-sm font-medium focus:ring-2 focus:ring-orange-500 transition-all dark:text-white"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-400" />
          </form>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm mb-12"
        >
          <h2 className="text-sm font-bold text-orange-600 uppercase tracking-wider mb-4">Reddit Consensus Summary</h2>
          <p className="text-2xl font-medium leading-relaxed text-slate-800 dark:text-slate-100">
            {data.summary}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {data.sources.map(s => (
              <span key={s.subreddit} className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-xs font-medium text-slate-500 dark:text-slate-200">
                r/{s.subreddit} ({s.count})
              </span>
            ))}
          </div>
        </motion.div>

        {/* Results List */}
        <div className="space-y-8">
          <h3 className="text-xl font-bold px-2 dark:text-white">Ranked Recommendations</h3>
          {data.products.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700">
              <p className="text-slate-500 dark:text-slate-200">No specific products were identified in the discussions.</p>
            </div>
          ) : (
            data.products.map((product, idx) => (
              <ProductCard 
                key={product.name} 
                product={product} 
                rank={idx + 1} 
                isSelected={selectedProducts.some(p => p.name === product.name)}
                onToggleSelect={() => toggleProductSelection(product)}
              />
            ))
          )}
        </div>

        {/* Floating Compare Bar */}
        <AnimatePresence>
          {selectedProducts.length > 0 && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4"
            >
              <div className="bg-slate-900 dark:bg-slate-800 text-white rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-4 border border-slate-700">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="flex -space-x-2">
                    {selectedProducts.map(p => (
                      <div key={p.name} className="w-8 h-8 rounded-full bg-orange-600 border-2 border-slate-900 dark:border-slate-800 flex items-center justify-center text-[10px] font-bold">
                        {p.name.charAt(0)}
                      </div>
                    ))}
                  </div>
                  <span className="text-sm font-medium whitespace-nowrap">
                    {selectedProducts.length} product{selectedProducts.length > 1 ? 's' : ''} selected
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setSelectedProducts([])}
                    className="p-2 hover:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-400 dark:text-slate-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <button 
                    disabled={selectedProducts.length < 2}
                    onClick={() => setIsComparing(true)}
                    className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:hover:bg-orange-600 text-white px-6 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2"
                  >
                    <Scale className="w-4 h-4" /> Compare
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Comparison Overlay */}
        <AnimatePresence>
          {isComparing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
              >
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-2xl font-bold flex items-center gap-3 dark:text-white">
                    <Scale className="w-6 h-6 text-orange-600" /> Product Comparison
                  </h3>
                  <button 
                    onClick={() => setIsComparing(false)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors dark:text-slate-200"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="flex-1 overflow-auto p-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {selectedProducts.map(p => (
                      <div key={p.name} className="space-y-8">
                        <div>
                          <div className={cn(
                            "inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider mb-2",
                            p.confidence === "high" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                            p.confidence === "medium" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-green-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200"
                          )}>
                            {p.confidence} Confidence
                          </div>
                          <h4 className="text-xl font-bold mb-1 leading-tight dark:text-white">{p.name}</h4>
                          <div className="text-sm text-slate-400 dark:text-slate-400 font-bold uppercase">{p.mentions} Mentions</div>
                        </div>

                        <div className="space-y-4">
                          <h5 className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-widest">Sentiment</h5>
                          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-orange-500" 
                              style={{ width: `${p.sentimentScore * 100}%` }}
                            />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h5 className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-widest flex items-center gap-2">
                            <ThumbsUp className="w-3 h-3" /> Top Pros
                          </h5>
                          <ul className="space-y-2">
                            {p.pros.map(pro => (
                              <li key={pro} className="text-sm text-slate-600 dark:text-slate-200 flex items-start gap-2">
                                <span className="text-green-500 mt-1">•</span> {pro}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="space-y-4">
                          <h5 className="text-xs font-bold text-red-500 dark:text-red-400 uppercase tracking-widest flex items-center gap-2">
                            <ThumbsDown className="w-3 h-3" /> Top Cons
                          </h5>
                          <ul className="space-y-2">
                            {p.cons.map(con => (
                              <li key={con} className="text-sm text-slate-600 dark:text-slate-200 flex items-start gap-2">
                                <span className="text-red-400 mt-1">•</span> {con}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <a
                          href={p.affiliateUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full bg-slate-900 dark:bg-slate-800 text-white py-3 px-4 rounded-xl font-bold text-center hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors text-sm"
                        >
                          View on Amazon
                        </a>
                        <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-400 text-center">Prices and availability may vary. Affiliate link.</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Disclaimer */}
        <div className="mt-16 p-6 bg-slate-100 dark:bg-slate-900 rounded-2xl text-slate-500 dark:text-slate-200 text-xs leading-relaxed">
          <p className="font-bold mb-2 uppercase tracking-tight">Disclaimer</p>
          These recommendations are generated by analyzing public Reddit discussions. They reflect community sentiment and may not be universal. As an Amazon Associate I earn from qualifying purchases.
        </div>
      </main>
    </div>
  );
}

function ProductCard({ product, rank, isSelected, onToggleSelect }: { 
  product: RankedProduct; 
  rank: number;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      className={cn(
        "bg-white dark:bg-slate-900 rounded-3xl border transition-all overflow-hidden flex flex-col md:flex-row relative group",
        isSelected ? "border-orange-600 ring-1 ring-orange-600" : "border-slate-200 dark:border-slate-800 shadow-sm"
      )}
    >
      {/* Selection Overlay/Button */}
      <div className="hidden md:flex absolute top-4 right-4 z-10 flex-col items-end">
        <button 
          onClick={onToggleSelect}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-all border-2",
            isSelected 
              ? "bg-orange-600 border-orange-600 text-white" 
              : "bg-white/80 dark:bg-slate-800/80 backdrop-blur border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-400 hover:border-orange-600 hover:text-orange-600"
          )}
        >
          {isSelected ? <Check className="w-5 h-5" /> : <Scale className="w-5 h-5" />}
        </button>
        <AnimatePresence>
          {showTooltip && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="mt-2 px-3 py-1 bg-slate-900 text-white text-[10px] font-bold rounded-lg shadow-xl uppercase tracking-widest whitespace-nowrap"
            >
              {isSelected ? "Selected" : "Compare"}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-8 flex-1">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-slate-900 dark:bg-slate-800 text-white w-6 h-6 flex items-center justify-center rounded-lg text-xs font-bold">
                {rank}
              </span>
              <span className={cn(
                "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider",
                product.confidence === "high" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                product.confidence === "medium" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200"
              )}>
                {product.confidence} Confidence
              </span>
            </div>
            <h4 className="text-2xl font-bold dark:text-white">{product.name}</h4>
          </div>
          <div className="text-right flex flex-col items-end">
            <div className="text-sm font-bold text-slate-400 dark:text-slate-400 uppercase">Mentions</div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">{product.mentions}</div>
            
            {/* Mobile-only positioning for the button to be below mentions */}
            <div className="md:hidden">
              <button 
                onClick={onToggleSelect}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-all border-2",
                  isSelected 
                    ? "bg-orange-600 border-orange-600 text-white" 
                    : "bg-white/80 dark:bg-slate-800/80 backdrop-blur border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-400 hover:border-orange-600 hover:text-orange-600"
                )}
              >
                {isSelected ? <Check className="w-5 h-5" /> : <Scale className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div>
            <h5 className="flex items-center gap-2 text-sm font-bold text-green-600 dark:text-green-400 mb-3">
              <ThumbsUp className="w-4 h-4" /> Pros
            </h5>
            <ul className="space-y-2">
              {product.pros.map(pro => (
                <li key={pro} className="text-sm text-slate-600 dark:text-slate-200 flex items-start gap-2">
                  <span className="text-green-500 mt-1">•</span> {pro}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h5 className="flex items-center gap-2 text-sm font-bold text-red-500 dark:text-red-400 mb-3">
              <ThumbsDown className="w-4 h-4" /> Cons
            </h5>
            <ul className="space-y-2">
              {product.cons.map(con => (
                <li key={con} className="text-sm text-slate-600 dark:text-slate-200 flex items-start gap-2">
                  <span className="text-red-400 mt-1">•</span> {con}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <h5 className="flex items-center gap-2 text-sm font-bold text-slate-400 dark:text-slate-400 uppercase">
            <Quote className="w-4 h-4" /> Reddit Quotes
          </h5>
          {product.quotes.map((quote, i) => (
            <div key={i} className="space-y-1">
              <blockquote className="pl-4 border-l-2 border-slate-100 dark:border-slate-800 italic text-sm text-slate-500 dark:text-slate-200 leading-relaxed">
                "{quote.text}"
              </blockquote>
            </div>
          ))}
        </div>
      </div>

      <div className="md:w-64 bg-slate-50 dark:bg-slate-900/50 p-8 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 flex flex-col justify-center items-center text-center">
        <div className="mb-6">
          <div className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase mb-1">Sentiment</div>
          <div className="w-32 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-orange-500" 
              style={{ width: `${product.sentimentScore * 100}%` }}
            />
          </div>
        </div>
        <a
          href={product.affiliateUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full bg-orange-600 text-white py-3 px-4 rounded-xl font-bold hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
        >
          View on Amazon
          <ExternalLink className="w-4 h-4" />
        </a>
        <p className="mt-4 text-[10px] text-slate-400 dark:text-slate-400">Prices and availability may vary. Affiliate link.</p>
      </div>
    </motion.div>
  );
}

export default function SearchResultsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchResultsContent />
    </Suspense>
  );
}

