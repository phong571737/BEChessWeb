# TTLab Chess Frontend

The frontend is a Next.js 16 App Router application using React 19, TypeScript, Tailwind CSS, semantic CSS variables, Zustand, Socket.IO Client, chess.js, and a browser Stockfish worker.

## Commands

From the repository root:

```powershell
npm --prefix frontend install
npm --prefix frontend run dev
npm --prefix frontend run build
npm --prefix frontend run start
```

The development server normally listens on port `3000`.

## Environment

For non-Docker local development, create `frontend/.env.local`:

```env
API_URL=http://localhost:8080
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_SOCKET_URL=http://localhost:8080
NEXT_PUBLIC_BASE_PATH=
```

- `API_URL` is the server-side backend target.
- `NEXT_PUBLIC_API_URL` is the browser REST origin override.
- `NEXT_PUBLIC_SOCKET_URL` is the browser Socket.IO origin override.
- `NEXT_PUBLIC_BASE_PATH` is an optional deployment prefix such as `/chess`.
- `BACKEND_PROXY_URL` is a server-only rewrite target used by Vercel when the backend is hosted separately.

Docker Compose supplies equivalent build arguments from root `BACKEND_PUBLIC_URL` and `FRONTEND_BASE_PATH`. Public values are compiled during `next build`, so changing them requires rebuilding the frontend image.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Active games and physical boards |
| `/board?id=<encoded-gameID>` | Live physical-board game |
| `/dashboard` | History summaries by board, player, result, and time |
| `/played` | Searchable game history and administrator recycle bin |
| `/played/review/[id]` | Move replay, notation, statistics, and saved Stockfish analysis |
| `/paste` | UCI/PGN import and branch preview |
| `/guide` | Board and companion-app onboarding |
| `/login`, `/register` | Authentication |

## Structure

```text
frontend/
├── app/                 App Router pages and global CSS
├── components/          Board, history, shell, providers, and shared UI primitives
├── hooks/               Game, clock, physical-board, active-game, and Stockfish lifecycles
├── lib/                 API resolution, auth, i18n, store, caches, PGN and analysis utilities
├── locales/             Matching English and Vietnamese dictionaries
├── public/              Images, QR code, Android APK, and Stockfish worker assets
├── types/               Frontend domain and socket contracts
├── Dockerfile           Standalone production image
└── next.config.ts       Base path, images, standalone output, and backend rewrites
```

## Localization rule

Do not hard-code user-facing text. Add the same key to `locales/en.ts` and `locales/vi.ts`, then render it through `useT()` and `t("key")`. This includes labels, tooltips, validation messages, dialogs, empty states, and accessibility text.

## Theme rule

Light and dark modes share the same semantic tokens and component implementations. Colors are defined centrally in `app/globals.css`; components consume tokens such as `background`, `card`, `muted`, `primary`, `border`, and `ring`. Theme changes are client-safe and do not require a refresh.

## Data flow

1. REST hydrates the initial game, board, history, and dashboard state.
2. Socket.IO joins the active `gameID` room and patches live state.
3. Zustand stores active games, physical boards, and per-game board projections.
4. The chess clock starts after the first accepted move and switches to the opponent.
5. Stockfish runs only in the browser and never mutates authoritative server state.

Detailed frontend documentation starts at [../docs/10-state-management.md](../docs/10-state-management.md).
