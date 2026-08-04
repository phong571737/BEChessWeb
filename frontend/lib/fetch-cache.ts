type CacheEntry<T> = {
    expiresAt: number;
    value: T;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();
const MAX_MEMORY_CACHE_ENTRIES = 100;

function pruneExpiredEntries(now = Date.now()): void {
  for (const [key, entry] of memoryCache) {
    if (entry.expiresAt <= now) memoryCache.delete(key);
  }
}

function enforceEntryLimit(): void {
  while (memoryCache.size >= MAX_MEMORY_CACHE_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey === undefined) return;
    memoryCache.delete(oldestKey);
  }
}

export class FetchNotFoundError extends Error {
  constructor(public url: string) {
    super(`Not found: ${url}`);
    this.name = "FetchNotFoundError";
  }
}

export function invalidateFetchCache(prefix = ""): void {
  pruneExpiredEntries();
  for (const key of memoryCache.keys()) {
    if (!prefix || key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
}

export async function fetchJSONCached<T>(url: string, ttlMs: number, init?: RequestInit): Promise<T> {
  const now = Date.now();
  pruneExpiredEntries(now);
  const cached = memoryCache.get(url) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return cached.value;

  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`Request failed: ${res.status} — ${url}`);
  const data = (await res.json()) as T;

  enforceEntryLimit();
  memoryCache.set(url, { value: data, expiresAt: now + ttlMs });
  return data;
}

