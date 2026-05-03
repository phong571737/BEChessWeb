# 12 — Next.js Client — Routes & Pages

---

## Proxy rewrites — `client/next.config.ts`

```ts
const API_URL = process.env.API_URL || "http://localhost:8080";

rewrites() {
  return [
    { source: "/games/:path*", destination: `${API_URL}/games/:path*` },
    { source: "/moves/:path*", destination: `${API_URL}/moves/:path*` },
    { source: "/eval",         destination: `${API_URL}/eval` },
  ];
}
```

`API_URL` is read from `process.env.API_URL` at **build time** on the Next.js server process. It is never sent to the browser.

Effect: `fetch("/games/current")` in the browser → Next.js server receives it → forwards to `http://localhost:8080/games/current` → returns response to browser. No CORS, no port 8080 in browser network tab.

---

## Pages

| Route | File | Component type | Description |
|---|---|---|---|
| `/` | `app/page.tsx` | Server | Home — active games grid |
| `/board?id=<b64>` | `app/board/page.tsx` | Client (Suspense) | Live board viewer |
| `/played` | `app/played/page.tsx` | Client | Game history table + stats |
| `/played/review/:id` | `app/played/review/[id]/page.tsx` | Client | PGN review + match analysis |
| `/log` | `app/log/page.tsx` | Client | ESP32 settings (UI placeholder) |

---

## Root layout — `app/layout.tsx`

- Loads **Aptos** font via `next/font/local` (4 weights/styles from `public/fonts/aptos/`)
- Sets `<html className={aptos.variable}>` and `<body className="font-sans">`
- Wraps content in `<Providers>` (ThemeProvider + SocketProvider)
- Wraps content in `<AppShell>` (Navbar + children)
- Sets site metadata: title template, description, og:image, canonical URL

---

## Page: `/` (Home)

**Type**: Server Component  
**Component**: `<GameGrid>` (Client, dynamically fetches + displays active games)

GameGrid:
1. Calls `useActiveGames()` → `GET /games/current`
2. Renders `<GameCard>` for each active game
3. Each card shows a mini chess board (dynamic import, SSR disabled)
4. Clicking a card navigates to `/board?id=<encodeGameID(gameID)>`

---

## Page: `/board?id=<b64>`

**Type**: Client Component, wrapped in `<Suspense>` (required for `useSearchParams`)

**URL param**: `id` = `btoa(gameID)` — base64-encoded to handle special characters.

**On load sequence**:
```
1. Decode id → gameID
2. useGame(gameID):
   a. fetchJSONCached("/games/:id", 1500) → initial board state to Zustand
   b. socket.emit("join", { gameID })
   c. socket.emit("request_current_game", { gameID })
   d. socket.emit("request_eval", { gameID, fen })

3. ResizeObserver on board wrapper div:
   useEffect([isLoaded]) ← IMPORTANT: depends on isLoaded
   Reason: the board DOM element is not rendered until isLoaded=true.
   If deps were [], the observer would attach when boardWrapRef.current=null
   and never re-run, leaving boardWidth stuck at 360.

4. Render layout:
   - Share bar (Copy link / Native Share / Social)
   - Grid: [ChessBoardView | EvalBar | GamePanel]
```

**Move navigation**: `navFen` state — `null` = show live position, string = show historical position.

---

## Page: `/played`

**Type**: Client Component  
**Component**: `<GameHistory>`

```
1. fetch("/games/history") → HistoryGame[]
2. Client-side filtering: result (1-0/0-1/1/2-1/2/all), search by player name
3. Client-side sorting: by date, moves, players, result
4. Stats computed from full dataset (not filtered)
5. Click row → navigate to /played/review/:id
```

---

## Page: `/played/review/:id`

**Type**: Client Component

```
1. fetchJSONCached("/games/history", 10_000) → HistoryGame[]
2. Find game where _id === params.id
3. Render <PGNReviewContent game={game} />
4. Render <MatchAnalysis game={game} />
```

**`PGNReviewContent`** builds a move timeline client-side:

```ts
const timeline = useMemo(() => {
  const c = new Chess();
  c.loadPgn(game.pgn);
  const sans = c.history();
  // replays moves one by one to capture FEN at each step
  return [{ fen: "start", lastMove: null }, ...sans.map(san => ...)]
}, [game]);
```

**Navigation**:
- Nav buttons: first / prev / next / end
- **Mouse wheel**: scroll up/down on board area → navigate moves (90 ms debounce, `passive: false`)
- **Audio**: Web Audio API triangle wave — 880 Hz (forward), 720 Hz (backward), 70 ms burst

---

## Page: `/log`

**Type**: Client Component  
UI placeholders for ESP32 BLE settings (Hall threshold, LED brightness, firmware OTA). Not yet connected to real BLE hardware.

---

## Open Graph images

| Route | File | Description |
|---|---|---|
| `/opengraph-image.tsx` | Root OG | Static image for site |
| `/played/review/[id]/opengraph-image.tsx` | Dynamic OG | Game-specific: White vs Black, result |

---

## 404 page — `app/not-found.tsx`

Rendered when any route is not matched. Minimal design with link back to home.

---

## SEO files

| File | Output | Content |
|---|---|---|
| `app/robots.ts` | `/robots.txt` | Allow all, sitemap URL |
| `app/sitemap.ts` | `/sitemap.xml` | Static routes |
| `app/manifest.ts` | `/manifest.webmanifest` | PWA metadata |
