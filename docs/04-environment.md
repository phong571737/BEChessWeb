# 04 — Environment Variables

---

## Server — `server/.env`

| Variable            | Required | Default                  | Description                                              |
|---------------------|----------|--------------------------|----------------------------------------------------------|
| `PORT`              | No       | `8080`                   | HTTP listen port                                         |
| `MONGO_URI`         | **Yes**  | —                        | MongoDB Atlas connection string (`mongodb+srv://…`)      |
| `ALLOWED_ORIGINS`   | No       | `http://localhost:3000`  | Comma-separated origins allowed by Socket.io CORS        |

### Example

```env
PORT=8080
MONGO_URI=mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/?appName=Cluster0
ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.100:3000
```

### How env is loaded

`server/config/environment.js` calls `dotenv.config({ path: join(__dirname, "../.env") })` using a **file-relative path**. This means the server can be started from any working directory (e.g. `node server/server.js` from the project root) and still find the `.env` file.

Exported object:

```js
export const env = {
  PORT:      process.env.PORT      || "8080",
  MONGO_URI: process.env.MONGO_URI,        // undefined if missing → connectDB throws
};
```

---

## Client — `client/.env.local`

| Variable   | Required | Default                  | Description                                                                                           |
|------------|----------|--------------------------|-------------------------------------------------------------------------------------------------------|
| `API_URL`  | No       | `http://localhost:8080`  | Express backend URL — used **only** by Next.js server-side rewrites at build/request time. Never sent to the browser. |

### Example

```env
API_URL=http://localhost:8080
```

For Docker/production, set `API_URL=http://server:8080` (internal Docker network name).

---

## How Socket.io URL is resolved (client-side)

Socket.io does **not** use `API_URL`. The browser derives the URL at runtime:

```ts
// client/lib/api-url.ts
export function getApiUrl(): string {
  if (typeof window === "undefined") {
    return process.env.API_URL ?? "http://localhost:8080";  // SSR fallback
  }
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8080`;
}
```

This means:
- Dev on `localhost` → connects to `http://localhost:8080` ✓
- Phone on LAN at `192.168.1.50` → connects to `http://192.168.1.50:8080` ✓
- No rebuild needed when IP changes ✓

---

## Variable scope summary

| Variable          | Where read                       | When read               | Exposed to browser   |
|-------------------|----------------------------------|-------------------------|----------------------|
| `MONGO_URI`       | `server/config/environment.js`   | Server startup          | No                   |
| `PORT`            | `server/config/environment.js`   | Server startup          | No                   |
| `ALLOWED_ORIGINS` | `server/sockets/index.js`        | Server startup          | No                   |
| `API_URL`         | `client/next.config.ts`          | Next.js build / rewrite | No                   |
| Socket.io URL     | `client/lib/api-url.ts`          | Browser runtime         | Derived, not stored  |
