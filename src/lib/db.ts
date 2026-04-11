import { SearchResult } from '../types';

const DB_NAME = 'RedditConsensusDB';
const DB_VERSION = 1;
const SEARCHES_STORE = 'recentSearches';
const CACHE_STORE = 'searchCache';

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SEARCHES_STORE)) {
        db.createObjectStore(SEARCHES_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'query' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveRecentSearch = async (query: string): Promise<void> => {
  const db = await initDB();
  const tx = db.transaction(SEARCHES_STORE, 'readwrite');
  const store = tx.objectStore(SEARCHES_STORE);
  
  // Get all searches to check for duplicates and limit count
  const allSearches = await new Promise<any[]>((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
  });

  // Remove duplicate if exists
  const existing = allSearches.find(s => s.query.toLowerCase() === query.toLowerCase());
  if (existing) {
    store.delete(existing.id);
  }

  // Add new search
  store.add({ query, timestamp: Date.now() });

  // Limit to 10 most recent
  const updatedSearches = await new Promise<any[]>((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
  });

  if (updatedSearches.length > 10) {
    const sorted = updatedSearches.sort((a, b) => a.timestamp - b.timestamp);
    const toDelete = sorted.slice(0, updatedSearches.length - 10);
    toDelete.forEach(s => store.delete(s.id));
  }
};

export const getRecentSearches = async (): Promise<string[]> => {
  const db = await initDB();
  const tx = db.transaction(SEARCHES_STORE, 'readonly');
  const store = tx.objectStore(SEARCHES_STORE);
  
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const results = req.result as any[];
      resolve(results.sort((a, b) => b.timestamp - a.timestamp).map(s => s.query));
    };
  });
};

export const removeRecentSearch = async (query: string): Promise<void> => {
  const db = await initDB();
  const tx = db.transaction(SEARCHES_STORE, 'readwrite');
  const store = tx.objectStore(SEARCHES_STORE);
  
  const allSearches = await new Promise<any[]>((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
  });

  const target = allSearches.find(s => s.query.toLowerCase() === query.toLowerCase());
  if (target) {
    store.delete(target.id);
  }
};

export const clearAllSearches = async (): Promise<void> => {
  const db = await initDB();
  const tx = db.transaction([SEARCHES_STORE, CACHE_STORE], 'readwrite');
  tx.objectStore(SEARCHES_STORE).clear();
  tx.objectStore(CACHE_STORE).clear();
};

export const saveToCache = async (query: string, result: SearchResult): Promise<void> => {
  const db = await initDB();
  const tx = db.transaction(CACHE_STORE, 'readwrite');
  const store = tx.objectStore(CACHE_STORE);
  store.put({ query: query.toLowerCase(), result, timestamp: Date.now() });

  // Limit cache to 20 items
  const allCache = await new Promise<any[]>((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
  });

  if (allCache.length > 20) {
    const sorted = allCache.sort((a, b) => a.timestamp - b.timestamp);
    const toDelete = sorted.slice(0, allCache.length - 20);
    toDelete.forEach(item => store.delete(item.query));
  }
};

export const getAllCache = async (): Promise<Record<string, SearchResult>> => {
  const db = await initDB();
  const tx = db.transaction(CACHE_STORE, 'readonly');
  const store = tx.objectStore(CACHE_STORE);
  
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const results = req.result as any[];
      const cache: Record<string, SearchResult> = {};
      results.forEach(item => {
        cache[item.query] = item.result;
      });
      resolve(cache);
    };
  });
};
