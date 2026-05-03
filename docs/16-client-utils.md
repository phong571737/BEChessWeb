# 16 — Client-Side Utilities

---

## `lib/api-url.ts` — Socket.io URL derivation

```ts
export function getApiUrl(): string {
  if (typeof window === "undefined") {
    // SSR / build time: use env var
    return process.env.API_URL ?? "http://localhost:8080";
  }
  // Browser runtime: derive from current page origin
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8080`;
}
```

**Used only for Socket.io connection** in `<SocketProvider>`. REST calls use relative paths (`/games/current`) which are proxied by Next.js rewrites.

**Why runtime derivation**: The same Next.js build must work on `localhost`, on a LAN IP (192.168.x.x), or any other hostname without rebuilding. Hardcoding the Socket.io URL at build time would break LAN access from phones or the ESP32.

---

## `lib/fetch-cache.ts` — Client-side TTL cache

In-memory cache for `fetch` calls. Prevents duplicate requests when multiple hooks or components request the same endpoint simultaneously.

```ts
const memoryCache = new Map<string, { value: T; expiresAt: number }>();

async function fetchJSONCached<T>(url: string, ttlMs: number): Promise<T>
function invalidateFetchCache(prefix?: string): void
```

### `fetchJSONCached<T>(url, ttlMs)`

```
1. Check memoryCache for url
2. If cached and not expired → return cached value immediately
3. Otherwise: fetch(url, { cache: "no-store" })
4. Parse JSON, store in memoryCache with expiresAt = now + ttlMs
5. Return data
```

The `cache: "no-store"` option on the underlying `fetch` call prevents the browser's HTTP cache from interfering. The TTL is managed entirely in JS memory.

### `invalidateFetchCache(prefix?)`

Deletes all cache entries whose key starts with `prefix`. Called after mutations:

```ts
// After restart or resign:
invalidateFetchCache("/games");
// Clears: "/games/current", "/games/game_alpha", "/games/history", etc.
```

### TTL values in use

| URL | TTL | Called by |
|---|---|---|
| `/games/:id` | 1 500 ms | `useGame` initial load |
| `/games/current` | 2 000 ms | `useActiveGames` |
| `/games/history` | 10 000 ms | `useActiveGames`, history page |

### Scope

The cache is a module-level `Map` — shared within a browser tab but **not** across tabs or page reloads.

---

## `lib/id-utils.ts` — Base64 gameID encoding

GameIDs may contain characters that are not URL-safe (slashes, spaces, Unicode). The `/board` page passes gameID as a query parameter, so it must be encoded.

```ts
export function encodeGameID(gameID: string): string {
  return btoa(gameID);         // base64 encode
}

export function decodeGameID(encoded: string): string {
  return atob(encoded);        // base64 decode
}
```

**Usage**:

```ts
// On GameCard click (home page):
router.push(`/board?id=${encodeGameID(game.gameID)}`);

// On board page load:
const rawID  = searchParams.get("id") ?? "";
const gameID = rawID ? decodeGameID(rawID) : "";
```

---

## `lib/utils.ts` — Class merging

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

Standard Shadcn utility. Combines `clsx` (conditional class logic) with `tailwind-merge` (deduplication of conflicting Tailwind classes).

```ts
// Example:
cn("px-4 py-2", isActive && "bg-blue-500", "px-2")
// → "py-2 bg-blue-500 px-2"  (px-4 is overridden by px-2 via tailwind-merge)
```

---

## `lib/socket.ts` — Socket.io client init

Creates the Socket.io client instance used by `<SocketProvider>`:

```ts
import { io } from "socket.io-client";
import { getApiUrl } from "./api-url";

export function createSocket() {
  return io(getApiUrl(), {
    transports: ["websocket", "polling"],
    autoConnect: true,
  });
}
```
