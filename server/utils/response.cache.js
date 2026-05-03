const cacheStore = new Map();

function now() {
  return Date.now();
}

export function getCached(key) {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    cacheStore.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached(key, value, ttlMs) {
  cacheStore.set(key, { value, expiresAt: now() + ttlMs });
}

export function invalidateCached(prefix = "") {
  for (const key of cacheStore.keys()) {
    if (!prefix || key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }
}

export function withCacheHeaders(res, maxAgeSec = 0) {
  if (maxAgeSec <= 0) {
    res.set("Cache-Control", "no-store");
    return;
  }
  res.set("Cache-Control", `public, max-age=${maxAgeSec}, stale-while-revalidate=${Math.max(1, maxAgeSec * 2)}`);
}
