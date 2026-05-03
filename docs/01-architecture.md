# 01 — Architecture Overview

## System diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  Physical Layer                                                       │
│  ESP32 (RFID array)  ──►  POST /boards/heartbeat  ──►  Express       │
│                      ──►  POST /boards/scan-result ──►  Express       │
│                      ──►  POST /moves              ──►  Express       │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Server  :8080                                                        │
│  ─────────────────────────────────────────────────────────────────   │
│  REST API    /games  /moves  /boards  /eval                          │
│  Socket.io   room per gameID  +  global events                       │
│  Game Manager   (RAM Maps + branch resolution)                        │
│  Stockfish      (UCI queue, depth-15, streaming cp)                   │
│  MongoDB Atlas  (games  ·  pgn_games  ·  moves)                      │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │  HTTP proxy (Next.js rewrites)
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Client  :3000                                                        │
│  Next.js 15  App Router  ·  React 19  ·  TypeScript                  │
│  Zustand store  ·  Socket.io-client  (direct :8080)                  │
└──────────────────────────────────────────────────────────────────────┘
                                   ▲
                          Browser / mobile clients
```

---

## Key design decisions

### 1. No CORS on REST calls
Next.js **rewrites** (`next.config.ts`) proxy every `/games/*`, `/moves/*`, and `/eval` request server-side to `http://localhost:8080`. The browser only ever calls port 3000 — CORS is never needed for REST.

### 2. Socket.io connects directly to port 8080
Socket.io cannot be proxied through Next.js rewrites without extra configuration. Instead, the browser derives the URL at runtime:

```ts
// lib/api-url.ts
const { protocol, hostname } = window.location;
return `${protocol}//${hostname}:8080`;
```

This lets the same production build work on any LAN IP (phone, ESP32 monitor, etc.) without rebuilding.

### 3. Dual persistence — RAM + MongoDB
Active games are held as `Chess` instances in `Map` objects for zero-latency move application. Every accepted move also upserts to MongoDB for crash recovery. Completed games are archived to a separate `pgn_games` collection.

### 4. Sensor noise — branch resolution
The ESP32 Hall-sensor array may simultaneously detect two pieces being lifted, producing two candidate UCI strings. The `game.manager.js` **branch system** handles this:

1. Both candidates create parallel chess instances (branches).
2. The first branch is committed optimistically.
3. On the **next** incoming move, only branches that allow that move survive.
4. If the surviving branch differs from the optimistic one, a `correctionPGN` is broadcast to all clients.

### 5. Evaluation streaming
A single Stockfish instance processes evaluation jobs from a queue. The `onEval(cp)` callback fires multiple times per job (once per depth increment), allowing the client to see the centipawn score updating in near-real-time before depth 15 completes.

---

## Technology stack

| Layer              | Technology         | Version       |
|--------------------|--------------------|--------------:|
| Runtime            | Node.js (ESM)      | 20            |
| HTTP server        | Express            | 5.1.0         |
| Real-time          | Socket.io          | 4.8.1         |
| Database           | MongoDB Atlas      | 7.0.0 (driver)|
| Chess engine       | Stockfish          | 18.0.7        |
| Chess logic        | chess.js           | 1.4.0         |
| Frontend framework | Next.js            | 15.3.2        |
| UI library         | React              | 19.0.0        |
| State management   | Zustand            | 5.0.0         |
| Styling            | Tailwind CSS       | 3.4.17        |
| Language (client)  | TypeScript         | 5.0.0         |
| Charts             | Recharts           | 2.15.4        |
| UI components      | Radix UI / Shadcn  | —             |
