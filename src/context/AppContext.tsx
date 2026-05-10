import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { SearchResult } from '../types';
import { 
  getRecentSearches, 
  saveRecentSearch, 
  removeRecentSearch, 
  clearAllSearches, 
  saveToCache, 
  getAllCache 
} from '../../../../../Downloads/reddit-consensus-engine (4)/src/lib/db.ts';

interface AppContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  recentSearches: string[];
  searchCache: Record<string, SearchResult>;
  addSearch: (query: string, result?: SearchResult) => void;
  removeSearch: (query: string) => void;
  clearSearches: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchCache, setSearchCache] = useState<Record<string, SearchResult>>({});

  // Load initial data from IndexedDB
  useEffect(() => {
    const loadData = async () => {
      try {
        const [searches, cache] = await Promise.all([
          getRecentSearches(),
          getAllCache()
        ]);
        setRecentSearches(searches);
        setSearchCache(cache);
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const addSearch = useCallback(async (query: string, result?: SearchResult) => {
    if (!query.trim()) return;
    
    try {
      await saveRecentSearch(query);
      const updated = await getRecentSearches();
      setRecentSearches(updated);

      if (result) {
        await saveToCache(query, result);
        setSearchCache(prev => ({
          ...prev,
          [query.toLowerCase()]: result
        }));
      }
    } catch (error) {
      console.error('Failed to add search:', error);
    }
  }, []);

  const removeSearch = useCallback(async (query: string) => {
    try {
      await removeRecentSearch(query);
      const updated = await getRecentSearches();
      setRecentSearches(updated);
    } catch (error) {
      console.error('Failed to remove search:', error);
    }
  }, []);

  const clearSearches = useCallback(async () => {
    try {
      await clearAllSearches();
      setRecentSearches([]);
      setSearchCache({});
    } catch (error) {
      console.error('Failed to clear searches:', error);
    }
  }, []);

  return (
    <AppContext.Provider value={{ 
      theme, 
      toggleTheme, 
      recentSearches, 
      searchCache, 
      addSearch, 
      removeSearch,
      clearSearches 
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
