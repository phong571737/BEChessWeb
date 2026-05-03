# 13 — React Component Tree

---

## Full component tree

```
app/layout.tsx
└── <Providers>                         ThemeProvider + LanguageProvider + SocketProvider
    └── <AppShell>
        ├── <AppSidebar>
        │   ├── Brand (logo + "TTLab Chess")
        │   ├── Nav items: Home / Played / Device
        │   └── Footer version string
        ├── Header (sticky)
        │   ├── Mobile hamburger / Desktop collapse toggle
        │   ├── Breadcrumb (desktop only, translated segment labels)
        │   ├── Language toggle ("English" / "Tiếng Việt")
        │   └── Theme toggle (sun/moon)
        └── <main> {children}

── / (app/page.tsx)
   └── <GameGrid>
       ├── Page header (title + game count + refresh button)
       ├── [physicalBoards.length > 0] Physical boards section
       │   └── <PhysicalBoardCard>[] — 4 states (see below)
       ├── [loading] 8× <Skeleton> cards
       ├── [empty]   <EmptyState>
       └── <GameCard>[] (one per ActiveGame)
           ├── <Chessboard> (dynamic import, SSR: false)
           └── Player names footer
       └── <StartGameDialog> (modal, opens when board card clicked)

── /board (app/board/page.tsx)  [Suspense boundary]
   └── <BoardContent>
       ├── [!gameID]      "Game ID missing" message
       ├── [!isLoaded]    <BoardSkeleton>
       ├── [waiting_scan] <ScanStateView status="waiting_scan">
       ├── [scan_failed]  <ScanStateView status="scan_failed">
       └── [playing/ended/waiting] Main layout:
           ├── [boardOffline]  <BoardOfflineBanner>
           ├── [activeAlert]   <AlertToast>          (fixed position)
           └── CSS Grid [board | evalBar | gamePanel]
               ├── col 1: <ChessBoardView>
               │   (+ horizontal <EvalBar> on mobile, below board)
               ├── col 2: <EvalBar> (vertical, lg+ only)
               └── col 3: <GamePanel>
                           ├── Connection indicator (Wifi/WifiOff + dot)
                           ├── Black player row (turn highlight + ThinkingClock)
                           ├── White player row (turn highlight + ThinkingClock)
                           ├── <PGNTable> (move pairs + elapsed time per move)
                           ├── Nav buttons ⏮ ◀ ▶ ⏭ + move counter
                           └── <GameActions>
                               └── <Dialog> (restart | resign)
                                   └── resign: choose White / Black / Draw

── /played (app/played/page.tsx)
   └── <GameHistory>
       ├── Page header (title + game count)
       ├── [loading] skeleton
       ├── [empty]   castle icon + message
       └── <StatCards>
           ├── Stats: white wins / black wins / draws + donut chart
           └── Filter bar: search · result dropdown · sort dropdown
           └── Games table (sortable columns, click row → review)

── /played/review/[id]  (app/played/review/[id]/page.tsx)
   ├── Back link + share buttons
   └── <PGNReviewContent>
       ├── Info grid: Duration · Moves · Result · Started
       ├── CSS Grid [board | moveReview]
       │   ├── <ChessBoardView> (wheel scroll → navigate)
       │   └── Move review panel (move grid + nav buttons)
       ├── PGN section (<details> for full PGN)
       └── <MatchAnalysis>
           ├── Stats mini cards (plies, captures, checks, castles/promotions)
           ├── <BarChart> — piece activity (Recharts)
           ├── <LineChart> — capture timeline (Recharts)
           └── <PieChart> — move type distribution (Recharts)

── /device (app/device/page.tsx)
   └── Device page
       ├── WiFi boards section (<WifiDeviceCard>[])
       └── BLE section
           ├── Availability check (browser support + HTTPS guard)
           ├── Scan button + <BleDeviceCard>[]
           └── [connected device]
               ├── <BleConfigForm> (WiFi / CFG / Web Server tabs)
               └── <OtaUploader> (firmware flash via BLE)
           └── BLE Terminal (LOG characteristic output)

── /not-found (app/not-found.tsx)
   └── Castle icon + "Page not found" + home link
```

---

## Component details

### `<PhysicalBoardCard>` — `components/home/physical-board-card.tsx`

```ts
Props {
  board:   PhysicalBoard;
  onClick: (board: PhysicalBoard) => void;
}
```

Four visual states driven by `board.gameStatus` and `board.gameID`:

| State | Condition | Border | Icon | Dot |
|-------|-----------|--------|------|-----|
| Ready | no gameID, gameStatus null | neutral | Cpu (green) | green pulse |
| Waiting scan | gameStatus === "waiting_scan" | amber | Loader2 spin | amber |
| Scan failed | gameStatus === "scan_failed" | red | Cpu (red) | red |
| In game | gameID set, gameStatus === "active" | blue | Cpu (blue) | blue |

Click behaviour:
- If `board.gameID` is set → navigate to `/board?id=<encodeGameID(gameID)>` (all statuses including scan states)
- If no `gameID` → open `<StartGameDialog>` to create a new game on this board

---

### `<StartGameDialog>` — `components/home/start-game-dialog.tsx`

```ts
Props {
  board:   PhysicalBoard | null;   // null = dialog closed
  onClose: () => void;
}
```

POST `/games` with `{ WhiteName, BlackName, boardID }`. On success, navigates to `/board?id=<encoded>`. Enter key submits from either name input.

---

### `<ScanStateView>` — inline in `app/board/page.tsx`

Full-page overlay shown when `status === "waiting_scan"` or `"scan_failed"`.

```ts
Props {
  status:       "waiting_scan" | "scan_failed";
  whiteName:    string;
  blackName:    string;
  scanMissing:  string[];
  scanReason:   "MISSING" | "DUPLICATE" | null;
  onRescan:     () => void;
  rescanLoading: boolean;
}
```

- `waiting_scan`: blue Loader2 spinner + "Scanning pieces..." hint
- `scan_failed`:
  - DUPLICATE reason → "Duplicate RFID tag detected" message
  - MISSING + squares → "Missing at: a1, h8" message
  - MISSING + no squares → generic "Scan failed" message
  - Rescan button (disabled while `rescanLoading`)

---

### `<BoardOfflineBanner>` — inline in `app/board/page.tsx`

Amber top banner shown when `boardOffline === true`. No props — just renders a WifiOff icon + translated message.

---

### `<AlertToast>` — inline in `app/board/page.tsx`

```ts
Props {
  alert:     BoardAlert;   // { code, detail }
  onDismiss: () => void;
}
```

`position: fixed; top: 70px; left: 50%; transform: translateX(-50%)` — always visible above the board, clears the offline banner.

Color coding by `alert.code`:
- `PIECE_LOST` → red
- `WRONG_TURN` / `ILLEGAL_DEST` → orange
- `TRACK_TIMEOUT` / `FALLBACK_TIMEOUT` / `LIFT_GLITCH` → yellow
- Unknown → red (fallback)

Label: translated via `t("board.alert.<code.toLowerCase()>")`, falls back to `code.replace(/_/g, " ")`.

---

### `<ChessBoardView>` — `components/board/chess-board-view.tsx`

```ts
Props {
  fen:        string;
  lastMove:   { from: string; to: string } | null;
  boardWidth: number;    // explicit px size
}
```

Wraps `react-chessboard`. Last move highlighted with `rgba(236,243,116,0.75)`.

---

### `<EvalBar>` — `components/board/eval-bar.tsx`

```ts
Props {
  cp?:          number | null;
  orientation?: "vertical" | "horizontal";   // default: vertical
}
```

Sigmoid conversion: `winRate = 1 / (1 + exp(-cp / 400))`. White segment height = `winRate * 100%`. Score label at 9px inside the bar.

---

### `<GamePanel>` — `components/board/game-panel.tsx`

```ts
Props {
  gameID:         string;
  whiteName:      string;
  blackName:      string;
  pgn:            string;
  boardConnected: boolean;
  status:         string;
  lastMoveAt:     number;              // drives ThinkingClock
  moveTimesMap:   Record<number, number>; // 0-based ply → elapsed ms
  onRestart:      () => Promise<void>;
  onResign:       (side: "white"|"black"|"draw") => Promise<void>;
  onNavigate:     (fen: string | null) => void;
}

// Exposes imperative handle for wheel navigation from parent:
interface GamePanelHandle {
  goBack:  () => void;
  goNext:  () => void;
  goStart: () => void;
  goEnd:   () => void;
}
```

Keyboard: `←/→` prev/next move, `Home/End` first/last (ignores inputs/textareas).

---

### `<PGNTable>` — `components/board/pgn-table.tsx`

```ts
Props {
  pgn:          string;
  cursor:       number;              // active ply index (0 = start, -1 = live end)
  moveTimesMap?: Record<number, number>;
  onGoTo:       (idx: number) => void;
}
```

Move pairs layout (cols: `26px | 1fr | 1fr`). Each move shows the SAN notation + elapsed time at `10px`. Auto-scrolls to active move. In live mode (cursor at end), auto-scrolls to bottom.

---

### `<GameActions>` — `components/board/game-actions.tsx`

```ts
Props {
  gameID:    string;
  onRestart: () => Promise<void>;
  onResign:  (side: "white"|"black"|"draw") => Promise<void>;
}
```

Restart + Resign buttons. Resign dialog offers three option cards (White resign / Black resign / Draw). Confirm button color matches outcome.

---

### `<StatCards>` — `components/played/stat-cards.tsx`

```ts
Props { games: HistoryGame[] }
```

Computes win/draw/loss counts and renders stat cards + pie chart (Recharts).

---

### `<MatchAnalysis>` — `components/played/match-analysis.tsx`

```ts
Props { game: HistoryGame }
```

Parses `game.pgn` with chess.js. Renders: piece activity BarChart, capture timeline LineChart, move type PieChart.
