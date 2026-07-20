type CacheEntry<T> = {
    expiresAt: number;
    value: T;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

export class FetchNotFoundError extends Error {
  constructor(public url: string) {
    super(`Not found: ${url}`);
    this.name = "FetchNotFoundError";
  }
}

export function invalidateFetchCache(prefix = ""): void {
  for (const key of memoryCache.keys()) {
    if (!prefix || key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
}

export async function fetchJSONCached<T>(url: string, ttlMs: number): Promise<T> {
  const now = Date.now();
  const cached = memoryCache.get(url) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return cached.value;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed: ${res.status} — ${url}`);
  const data = (await res.json()) as T;

  memoryCache.set(url, { value: data, expiresAt: now + ttlMs });
  return data;
}

