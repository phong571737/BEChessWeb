# 02 — Repository Structure

```
BEChessWeb/
│
├── docs/                              ← this folder
│
├── server/                            Express backend (Node.js ESM)
│   ├── server.js                      Entry point — boot sequence
│   ├── seed.js                        DB seed script (sample games)
│   │
│   ├── config/
│   │   ├── database.js                MongoDB singleton (connectDB / getDB)
│   │   └── environment.js             Env validation → exports { env }
│   │
│   ├── controllers/
│   │   ├── game.controller.js         CRUD: games list, history, delete
│   │   ├── game.action.controller.js  restart / resign / rename / destroy / reset
│   │   └── stockfish.controller.js    GET /eval → getEval()
│   │
│   ├── errors/
│   │   └── index.js                   AppError, NotFoundError, ValidationError…
│   │
│   ├── game/
│   │   └── game.manager.js            Core state machine
│   │                                  (RAM Maps + DB bridge + branch resolution)
│   │
│   ├── models/
│   │   └── game.model.js              MongoDB queries
│   │                                  (saveGame, loadGame, endGame, renamePlayer…)
│   │
│   ├── routes/
│   │   ├── game.route.js              /games router (all game endpoints)
│   │   ├── move.route.js              /moves router (ESP32 move endpoint)
│   │   └── eval.route.js              / router (GET /eval)
│   │
│   ├── services/
│   │   ├── game.service.js            createGame workflow
│   │   ├── game.action.service.js     restart / reset / rename / destroy
│   │   ├── game.resign.service.js     endgame archive workflow
│   │   ├── chess.service.js           chess.js helpers (findValidMove, applyMove)
│   │   ├── board.service.js           Hall-sensor initial board validation
│   │   ├── stockfish.instance.js      Singleton export of StockfishService
│   │   ├── stockfish.service.js       StockfishService class (queue + Promise)
│   │   └── initcheck.service.js       Per-game initcheck in-memory storage
│   │
│   ├── sockets/
│   │   ├── index.js                   initSocket(server) + getIO()
│   │   ├── game.socket.js             join / request_current_game / esp_move / resign / restart
│   │   ├── eval.socket.js             request_eval → eval_realtime / eval_bestmove
│   │   └── socket.emitter.js          Shared emit helpers
│   │
│   ├── utils/
│   │   └── response.cache.js          Server-side in-memory TTL cache
│   │
│   ├── package.json
│   └── .env                           PORT, MONGO_URI, ALLOWED_ORIGINS
│
├── client/                            Next.js 15 frontend
│   ├── app/                           App Router
│   │   ├── layout.tsx                 Root layout (Aptos font, providers, metadata)
│   │   ├── page.tsx                   / — home, active games grid
│   │   ├── globals.css                CSS variables, base styles
│   │   ├── manifest.ts                PWA manifest
│   │   ├── robots.ts                  robots.txt
│   │   ├── sitemap.ts                 sitemap.xml
│   │   ├── not-found.tsx              404 page
│   │   ├── opengraph-image.tsx        Root OG image
│   │   ├── board/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx               /board?id=<b64> — live board viewer
│   │   ├── played/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx               /played — game history table
│   │   │   └── review/
│   │   │       ├── layout.tsx
│   │   │       └── [id]/
│   │   │           ├── layout.tsx
│   │   │           ├── page.tsx       /played/review/:id — PGN review
│   │   │           └── opengraph-image.tsx
│   │   └── log/
│   │       ├── layout.tsx
│   │       └── page.tsx               /log — ESP32 settings (UI placeholder)
│   │
│   ├── components/
│   │   ├── board/
│   │   │   ├── chess-board-view.tsx   Chessboard wrapper + last-move highlight
│   │   │   ├── eval-bar.tsx           Centipawn bar (vertical / horizontal)
│   │   │   ├── game-actions.tsx       Restart / resign dialog
│   │   │   ├── game-panel.tsx         Player names, PGN table, nav controls
│   │   │   └── pgn-table.tsx          Scrollable move list
│   │   ├── home/
│   │   │   ├── game-card.tsx          Mini board card for active game
│   │   │   ├── game-grid.tsx          Home page grid container
│   │   │   └── empty-state.tsx        "No active games" placeholder
│   │   ├── layout/
│   │   │   ├── app-shell.tsx          Root shell (navbar + children)
│   │   │   └── navbar.tsx             Nav links, theme toggle, mobile menu
│   │   ├── played/
│   │   │   ├── game-history.tsx       History table + filters + stats
│   │   │   ├── history-item.tsx       Single table row
│   │   │   ├── stat-cards.tsx         Summary stat tiles + progress bar
│   │   │   ├── pgn-modal.tsx          PGNReviewContent + PGNModal (Dialog)
│   │   │   └── match-analysis.tsx     Charts: piece activity, captures, move types
│   │   ├── providers/
│   │   │   ├── providers.tsx          Root provider wrapper
│   │   │   ├── socket-provider.tsx    Socket.io context + useSocket()
│   │   │   └── theme-provider.tsx     next-themes dark/light
│   │   └── ui/                        Shadcn / Radix UI components
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── chart.tsx              Recharts integration
│   │       ├── dialog.tsx
│   │       ├── scroll-area.tsx
│   │       ├── separator.tsx
│   │       └── skeleton.tsx
│   │
│   ├── hooks/
│   │   ├── use-game.ts                Live board state + socket sync
│   │   ├── use-active-games.ts        Home page active games list
│   │   └── use-socket.ts              Socket context accessor
│   │
│   ├── lib/
│   │   ├── store.ts                   Zustand store (activeGames + boards)
│   │   ├── fetch-cache.ts             Client-side in-memory TTL fetch cache
│   │   ├── api-url.ts                 Runtime Socket.io URL derivation
│   │   ├── id-utils.ts                Base64 encode/decode for gameID in URL
│   │   └── utils.ts                   cn() helper (clsx + tailwind-merge)
│   │
│   ├── types/
│   │   ├── game.types.ts              ActiveGame, HistoryGame, BoardState
│   │   └── socket.types.ts            SocketEvents, MoveData
│   │
│   ├── public/
│   │   └── fonts/aptos/               Self-hosted Aptos font files (.ttf)
│   │
│   ├── next.config.ts                 API rewrites config
│   ├── tailwind.config.ts             Theme, fonts, plugins
│   ├── tsconfig.json                  TypeScript config (@/* path alias)
│   ├── postcss.config.mjs
│   ├── package.json
│   └── .env.local                     API_URL (build-time only)
│
├── package.json                       Root workspace (orchestration scripts only)
├── Dockerfile                         Server-only production image
├── docker-compose.yml                 MongoDB + Express + Next.js
└── TECHNICAL.md                       Single-file summary (see docs/ for detail)
```

---

## Naming conventions

| Convention | Example |
|---|---|
| Server files | `kebab-case.js` |
| Client files | `kebab-case.tsx` / `.ts` |
| React components | `PascalCase` (default export) |
| Hooks | `use-kebab-case.ts` → `useCamelCase()` |
| Route handlers | Inline arrow functions or named `Controller` objects |
| MongoDB field names | Mixed — `gameID` (string PK), `WhiteName` / `BlackName` (game data), `createAt` (typo, kept for compat) |
