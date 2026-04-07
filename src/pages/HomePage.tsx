"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, MessageSquare, ShieldCheck, Zap, History, Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { useAppContext } from "../context/AppContext";
import ThemeToggle from "../components/ThemeToggle";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { recentSearches, addSearch, removeSearch, clearSearches } = useAppContext();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      addSearch(query.trim());
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleRemoveSearch = (e: React.MouseEvent, s: string) => {
    e.stopPropagation();
    removeSearch(s);
  };

  const examples = [
    "best office chair under 500",
    "best laptop for gaming",
    "best espresso grinder for beginners",
    "best carry on luggage for international travel",
    "mechanical keyboard for coding"
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans transition-colors duration-300">
      {/* Header with Theme Toggle */}
      <header className="max-w-7xl mx-auto px-6 py-4 flex justify-end">
        <ThemeToggle />
      </header>

      {/* Hero Section */}
      <main className="max-w-4xl mx-auto px-6 pt-6 pb-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
            Reddit Consensus Engine
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-200 mb-12 max-w-2xl mx-auto">
            Stop reading 50 threads. Get the community-driven truth about any product, grounded in real Reddit discussions.
          </p>
        </motion.div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto mb-12">
          <div className="relative group">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for 'best office chair'..."
              className="w-full pl-14 pr-16 md:pr-32 py-5 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl text-lg focus:outline-none focus:border-orange-500 transition-all shadow-sm group-hover:shadow-md dark:text-white"
            />
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-400 w-6 h-6" />
            <button
              type="submit"
              className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 bg-orange-600 text-white p-2.5 md:px-6 md:py-2.5 rounded-xl font-semibold hover:bg-orange-700 transition-colors flex items-center gap-2"
              aria-label="Analyze"
            >
              <span className="hidden md:inline">Analyze</span>
              <ArrowRight className="w-5 h-5 md:w-4 md:h-4" />
            </button>
          </div>
        </form>

        {/* Recent Searches */}
        {recentSearches.length > 0 && (
          <div className="max-w-2xl mx-auto mb-12 text-left">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-400 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <History className="w-4 h-4" /> Recent Searches
              </h3>
              <button
                onClick={clearSearches}
                className="text-xs text-slate-400 dark:text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((s) => (
                <div
                  key={s}
                  className="group flex items-center bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-sm transition-colors border border-slate-200 dark:border-slate-800 overflow-hidden"
                >
                  <button
                    onClick={() => navigate(`/search?q=${encodeURIComponent(s)}`)}
                    className="px-3 py-1.5 text-slate-600 dark:text-slate-200"
                  >
                    {s}
                  </button>
                  <button
                    onClick={(e) => handleRemoveSearch(e, s)}
                    className="px-2 py-1.5 border-l border-slate-200 dark:border-slate-800 text-slate-400 hover:text-red-500 transition-colors"
                    aria-label={`Remove ${s} from history`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Examples */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          <h3 className="w-full text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-widest mb-2">Try these</h3>
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                addSearch(ex);
                navigate(`/search?q=${encodeURIComponent(ex)}`);
              }}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-200 rounded-full text-sm transition-colors border border-slate-200 dark:border-slate-800"
            >
              {ex}
            </button>
          ))}
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 text-left">
          <FeatureCard
            icon={<MessageSquare className="w-6 h-6 text-orange-600" />}
            title="Community Grounded"
            description="Every recommendation is backed by actual user comments and sentiment from relevant subreddits."
          />
          <FeatureCard
            icon={<ShieldCheck className="w-6 h-6 text-orange-600" />}
            title="Trust First"
            description="We surface disagreements and show confidence levels. No fake AI confidence here."
          />
          <FeatureCard
            icon={<Zap className="w-6 h-6 text-orange-600" />}
            title="Instant Synthesis"
            description="Get pros, cons, and best-for labels in seconds instead of hours of manual research."
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-100 dark:border-slate-900 py-12 text-center text-slate-400 dark:text-slate-400 text-sm">
        <p>© 2026 Reddit Consensus Engine. Not affiliated with Reddit Inc.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-6 rounded-2xl border border-slate-100 dark:border-slate-900 bg-slate-50/50 dark:bg-slate-900/50">
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-bold mb-2">{title}</h3>
      <p className="text-slate-600 dark:text-slate-200 text-sm leading-relaxed">{description}</p>
    </div>
  );
}
