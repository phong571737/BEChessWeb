# 14 — Zustand State Store

**File**: `client/lib/store.ts`

---

## Store shape

```ts
interface GameStoreState {
  // Home page — list of active games
  activeGames:    ActiveGame[];
  setActiveGames: (games: ActiveGame[]) => void;

  // Home page — physical boards detected via heartbeat
  physicalBoards:               PhysicalBoard[];
  patchPhysicalBoard:           (board: Omit<PhysicalBoard, "gameStatus"> & { gameStatus?: PhysicalBoard["gameStatus"] }) => void;
  patchPhysicalBoardGameStatus: (gameID: string, gameStatus: PhysicalBoard["gameStatus"]) => void;
  removePhysicalBoard:          (boardID: string) => void;

  // Board page — per-game live state, keyed by gameID
  boards:    Record<string, BoardState>;
  patchBoard:(gameID: string, patch: Partial<BoardState>) => void;
  getBoard:  (gameID: string) => BoardState | undefined;
}
```

---

## `PhysicalBoard` — physical board entry

```ts
interface PhysicalBoard {
  boardID:    string;
  gameID:     string | null;
  gameStatus: "waiting_scan" | "scan_failed" | "active" | null;
  online:     boolean;
  lastSeen:   number;             // Unix ms from server
  ip?:        string | null;
}
```

Populated by:
1. Initial `GET /boards` fetch on mount of `usePhysicalBoards`
2. `board_heartbeat` socket events (ongoing)

### `patchPhysicalBoard(board)`

If `board.online === false`, the board is **removed** from the list.  
Otherwise, the entry is merged (new fields win), preserving `gameStatus` if not supplied:

```ts
const merged: PhysicalBoard = {
  gameStatus: null,   // default
  ...existing,        // existing state (including previous gameStatus)
  ...board,           // new data from server
};
```

### `patchPhysicalBoardGameStatus(gameID, gameStatus)`

Updates `gameStatus` on whichever board entry has `b.gameID === gameID`. Called by `usePhysicalBoards` when a `game_status_update` event arrives.

### `removePhysicalBoard(boardID)`

Removes the board entry entirely. Called when `board_offline` arrives.

---

## `BoardState` — per-game live state

```ts
interface BoardState {
  fen:            string;         // FEN string; "start" until first move
  pgn:            string;
  cp:             number | null;  // centipawns; null = no eval
  whiteName:      string;
  blackName:      string;
  lastMove:       { from: string; to: string } | null;
  boardConnected: boolean;
  status:         "playing" | "ended" | "waiting" | "waiting_scan" | "scan_failed";
  scanMissing:    string[];       // squares missing at last scan; [] otherwise
  scanReason:     "MISSING" | "DUPLICATE" | null;
}
```

### Status values

| Value | Meaning |
|-------|---------|
| `"waiting"` | Game loaded, no moves yet, no board attached |
| `"waiting_scan"` | Physical board attached, awaiting 32-piece scan |
| `"scan_failed"` | Scan attempted but failed (missing pieces or duplicate tag) |
| `"playing"` | Scan passed or game is live |
| `"ended"` | Game finished (resigned/drawn) |

### Default (applied when `patchBoard` first touches a gameID)

```ts
const defaultBoard = (): BoardState => ({
  fen:            "start",
  pgn:            "",
  cp:             null,
  whiteName:      "White",
  blackName:      "Black",
  lastMove:       null,
  boardConnected: false,
  status:         "waiting",
  scanMissing:    [],
  scanReason:     null,
});
```

---

## Actions

### `setActiveGames(games)`
Replaces the entire `activeGames` array. Called by `useActiveGames` after each fetch.

### `patchBoard(gameID, patch)`
Merges `patch` into existing board state (starting from `defaultBoard()` if unseen):

```ts
// Examples used by useGame:
patchBoard(gameID, { fen, pgn, lastMove });                        // on esp_move
patchBoard(gameID, { cp });                                        // on eval_update
patchBoard(gameID, { boardConnected: true, status: "playing" });   // on board_scan_ok
patchBoard(gameID, { status: "waiting_scan", scanMissing: [], scanReason: null }); // on rescan
patchBoard(gameID, {                                               // on board_scan_failed
  status: "scan_failed",
  scanMissing: ["a1", "h8"],
  scanReason: "MISSING",
});
patchBoard(gameID, { boardConnected: false });                      // on board_offline
```

### `getBoard(gameID)`
Returns `BoardState | undefined`. Components should coalesce: `board ?? defaultBoard()`.

---

## Persistence

The store is **not persisted**. State is rebuilt on every page load from:
1. REST `GET /games/:id` → initial `patchBoard()`
2. `GET /boards` → initial `patchPhysicalBoard()` calls
3. Socket events → incremental patches

The server is the source of truth. Client state is always ephemeral.
