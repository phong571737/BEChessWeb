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

// Background sweep: dọn entries hết TTL mỗi 5 phút để tránh tích lũy stale entries
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const sweepTimer = setInterval(() => {
    const ts = now();
    let removed = 0;
    for (const [key, entry] of cacheStore) {
        if (entry.expiresAt <= ts) {
            cacheStore.delete(key);
            removed++;
        }
    }
    if (removed > 0) {
        console.log(`[Cache] Swept ${removed} expired entries`);
    }
}, SWEEP_INTERVAL_MS);

// Không block Node.js exit
if (sweepTimer.unref) sweepTimer.unref();