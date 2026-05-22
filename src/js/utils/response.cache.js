const cacheStore = new Map();

function now() {
    return Date.now();
}

// Get data from cache
export function getCached(key) {
    const entry = cacheStore.get(key);
    if (!entry) return null;

    if (entry.expiresAt <= now()) {
        cacheStore.delete(key);
        return null;
    }

    return entry.value;
}

// Set data to cache 
export function setCached(key, value, ttlMs) {
    cacheStore.set(key, {value, expiresAt: now() + ttlMs});
}

// Remove cache
export function invalidateCached(predix = "") {
    for (const key of cacheStore.keys()) {
        if (!predix || key.startsWith(predix)) {
            cacheStore.delete(key);
        }
    }
}

// HTTP cache header
export function withCacheHeaders(res, maxAgeSec = 0) {
  if (maxAgeSec <= 0) {
    res.set("Cache-Control", "no-store");
    return;
  }
  res.set("Cache-Control", `public, max-age=${maxAgeSec}, stale-while-revalidate=${Math.max(1, maxAgeSec * 2)}`);
}