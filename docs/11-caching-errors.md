# 11 — Server Caching & Error Handling

---

## Server-side response cache

**File**: `server/utils/response.cache.js`

In-memory TTL cache used by controllers to avoid redundant MongoDB queries on frequently-polled endpoints.

### API

```js
getCached(key)
// Returns the cached value if not expired, otherwise undefined.

setCached(key, value, ttlMs)
// Stores value with an expiry time of now + ttlMs.

invalidateCached(prefix)
// Deletes all keys that start with `prefix`.
// Call after mutations (e.g. after resign/restart) to force fresh data.

withCacheHeaders(res, maxAgeSec)
// Sets Cache-Control: public, max-age=N on the response.
// Allows CDN/browser to cache static responses.
```

### Cache keys in use

| Key | TTL | Used by |
|---|---|---|
| `"games:current"` | 2 000 ms | `GET /games/current` |
| `"games:history"` | 10 000 ms | `GET /games/history` |
| `"games:<id>"` | 2 000 ms | `GET /games/:id` |

### Why short TTLs?

Active game endpoints need to be nearly real-time but also need to absorb polling bursts from multiple connected clients. 2 s is enough to deduplicate concurrent requests without showing stale data for more than two seconds.

History has a 10 s TTL because it changes only on resign/endgame and does not need sub-second freshness.

### Client-side fetch cache

The **client** has its own separate in-memory TTL cache (`client/lib/fetch-cache.ts`). See [16-client-utils.md](./16-client-utils.md).

---

## Error classes

**File**: `server/errors/index.js`

```js
class AppError extends Error {
  constructor(message, statusCode, code) { ... }
}

class NotFoundError     extends AppError  // 404
class ValidationError   extends AppError  // 400
class GameNotFoundError extends AppError  // 404, code: "GAME_NOT_FOUND"
class InvalidMoveError  extends AppError  // 422, code: "INVALID_MOVE"
```

These classes are available throughout the server but are currently used mainly in service-layer validation. The route handlers use explicit `res.status(4xx).json()` returns rather than throwing errors.

---

## Controller error handling pattern

Every controller method wraps its logic in `try/catch` and always sends a response in the `catch` block:

```js
async getCurrent(req, res) {
  try {
    const games = await loadAllGame();
    res.json(games ?? []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
```

**Why this matters**: If a controller throws without sending a response, Express 5 closes the connection, causing the client to receive an `ECONNRESET` error. The `catch` block prevents this by always sending a 500 response.

---

## Common error responses

| Scenario | Status | Body |
|---|---|---|
| DB query fails | 500 | `{ "error": "..." }` |
| gameID missing in body | 400 | `{ "error": "gameID required" }` |
| Invalid color in rename | 400 | `{ "error": "color must be White or Black" }` |
| Move route server crash | 500 | `{ "status": "server_error", "message": "Internal server error" }` |
| Move route bad input | 400 | `{ "status": "invalid_request", "message": "Missing move data" }` |
