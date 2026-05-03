# BEChessWeb — Technical Docs

> **Stack**: Node.js (ESM) · Express 5 · Socket.io · MongoDB Atlas · Stockfish 18 · Next.js 15 · React 19 · TypeScript · Tailwind CSS · Zustand  
> **Hardware**: ESP32 physical chess board (RFID array) → WiFi HTTP REST + BLE

---

## Documents

| # | File | Topic |
|---|---|---|
| 1 | [01-architecture.md](./01-architecture.md) | System architecture & design decisions |
| 2 | [02-repository-structure.md](./02-repository-structure.md) | Full directory tree with file annotations |
| 3 | [03-boot-sequence.md](./03-boot-sequence.md) | Server entry point & startup order |
| 4 | [04-environment.md](./04-environment.md) | Environment variables (server + client) |
| 5 | [05-database.md](./05-database.md) | MongoDB collections & document schemas |
| 6 | [06-api-rest.md](./06-api-rest.md) | REST API reference — all endpoints |
| 7 | [07-api-socket.md](./07-api-socket.md) | Socket.io events (client↔server) |
| 8 | [08-game-engine.md](./08-game-engine.md) | Game state machine, move pipeline, branch resolution |
| 9 | [09-stockfish.md](./09-stockfish.md) | Stockfish integration — queue, eval streaming |
| 10 | [10-services.md](./10-services.md) | Server service layer (game, resign, chess, board) |
| 11 | [11-caching-errors.md](./11-caching-errors.md) | Server TTL cache & error classes |
| 12 | [12-nextjs-routes.md](./12-nextjs-routes.md) | Next.js pages, rewrites, page-level logic |
| 13 | [13-components.md](./13-components.md) | React component tree & props |
| 14 | [14-state-store.md](./14-state-store.md) | Zustand store — shape & actions |
| 15 | [15-hooks.md](./15-hooks.md) | Custom hooks — lifecycle & return values |
| 16 | [16-client-utils.md](./16-client-utils.md) | Client-side utilities (api-url, fetch-cache, id-utils) |
| 17 | [17-styling.md](./17-styling.md) | Tailwind config, Aptos font, theme variables |
| 18 | [18-data-flow.md](./18-data-flow.md) | End-to-end data flow diagrams (4 scenarios) |
| 19 | [19-scripts-seed.md](./19-scripts-seed.md) | Build/run scripts & seed data |
| 20 | [20-docker.md](./20-docker.md) | Docker & docker-compose deployment |

---

## Quick start

```bash
# Install all dependencies
npm run predev:all

# Run server + client together (development)
npm run dev:all

# Seed sample games into MongoDB
npm run seed

# Run server only
npm run dev:server

# Run client only
npm run dev:client
```

Ports: Express `8080` · Next.js `3000`

---

*Updated 2026-05-02 · docs 06, 07, 13, 14, 15 revised for WiFi board integration*
