# 15 — Custom Hooks

---

## `useGame(gameID)` — `hooks/use-game.ts`

Primary hook for the `/board` page. Loads initial game state, subscribes to socket events, manages scan and alert state.

### Returns

```ts
{
  // Board state
  fen:            string;
  pgn:            string;
  cp:             number | null;
  whiteName:      string;
  blackName:      string;
  lastMove:       { from: string; to: string } | null;
  boardConnected: boolean;
  status:         "playing" | "ended" | "waiting" | "waiting_scan" | "scan_failed";
  scanMissing:    string[];
  scanReason:     "MISSING" | "DUPLICATE" | null;

  // Physical board state
  boardOffline:   boolean;          // true when board_offline received for this game
  activeAlert:    BoardAlert | null; // current in-game error alert
  dismissAlert:   () => void;

  // Move history
  moves:          string[];         // SAN list parsed from pgn
  moveTimesMap:   Record<number, number>; // 0-based ply → elapsed ms (live moves only)
  lastMoveAt:     number;           // Unix ms of last move (drives thinking clock)

  // Loading
  isLoaded:       boolean;

  // Actions
  restart:        () => Promise<void>;
  resign:         (resignSide: "white"|"black"|"draw") => Promise<void>;
  rescan:         () => Promise<void>;
  rescanLoading:  boolean;

  chess:          Chess;            // live chess.js instance
}
```

### Socket effects lifecycle

**Effect 1 — Early join** (deps: `[socket, gameID]`)  
Runs immediately when socket connects, no `isLoaded` guard. This ensures the client is in the game room to receive `board_scan_ok` / `board_scan_failed` while the scan overlay is showing.

```ts
socket.emit("join", { gameID });
```

**Effect 2 — Scan / offline / alert events** (deps: `[socket, gameID, patchBoard]`)  
Also fires before `isLoaded`. Listens for:

| Event | Handler |
|-------|---------|
| `board_scan_ok` | `status: "playing"`, `boardConnected: true`, clear `scanMissing`/`scanReason` |
| `board_scan_failed` | `status: "scan_failed"`, set `scanMissing`, `scanReason` |
| `game_status_update` | `status` → `"waiting_scan"` / `"scan_failed"` / `"playing"` |
| `board_offline` | `boardOffline = true`, `boardConnected: false` |
| `board_alert` | set `activeAlert`; start 6 s auto-dismiss timer (clears previous timer first) |

**Effect 3 — Game events** (deps: `[socket, gameID, isLoaded]`, only runs after load)

| Event | Handler |
|-------|---------|
| `esp_move` | update fen/pgn/lastMove; record move timing in `moveTimesMap`; request eval |
| `eval_update` | update `cp` |
| `restore_game` | full reset of chess.js + board state |
| `board_connected` | `boardConnected: true`, `status: "playing"` |
| `game:renamed` | patch only the changed side (`WhiteName` or `BlackName`) |
| `update_all_game` | full reset of chess.js + board state (after restart) |

### REST load (Effect 4)

```ts
fetchJSONCached("/games/:id", 1_500)
```

Maps `game.status` to `BoardState.status`:
- `"waiting_scan"` → `"waiting_scan"`
- `"scan_failed"` → `"scan_failed"`
- `"finished"` → `"ended"`
- anything else → `"playing"`

Also restores `scanMissing`, `scanReason` and the move timing seed from `game.movedAt`.

### `rescan()`

```ts
patchBoard(gameID, { status: "waiting_scan", scanMissing: [], scanReason: null });
setBoardOffline(false);
POST /games/:id/rescan
```

### `BoardAlert` type

```ts
interface BoardAlert {
  code:   string;  // e.g. "WRONG_TURN", "PIECE_LOST"
  detail: string;  // context string from ESP32
}
```

Alert auto-dismisses after **6 seconds**. The timer is reset if a new alert arrives before the previous one expires.

---

## `usePhysicalBoards()` — `hooks/use-physical-boards.ts`

Manages the list of online physical boards for the home page.

### Returns

```ts
{
  boards:  PhysicalBoard[];
  loading: boolean;
}
```

### Lifecycle

```
Mount:
  GET /boards
  → forEach: patchPhysicalBoard(b)
  → loading = false

Socket listeners:
  "board_heartbeat"    → patchPhysicalBoard(board)
                         (online: false removes the board)
  "board_offline"      → removePhysicalBoard(boardID)
  "game_status_update" → patchPhysicalBoardGameStatus(gameID, status)
```

---

## `useActiveGames()` — `hooks/use-active-games.ts`

Fetches and maintains the list of active games.

### Returns

```ts
{
  activeGames: ActiveGame[];
  loading:     boolean;
  refresh:     () => Promise<void>;
}
```

### Lifecycle

```
Mount:
  fetchJSONCached("/games/current", 2000)
  → setActiveGames(data)

Socket listeners:
  "game:created"   → invalidateCache + refresh()
  "game:destroyed" → invalidateCache + refresh()
```

---

## `useSocket()` — `hooks/use-socket.ts`

Returns the Socket.io instance from `SocketContext`, or `null` during SSR / before connection.

```ts
const socket = useSocket();
```

The connection is established in `<SocketProvider>` on mount using the runtime API URL (`window.location.hostname:8080`).

---

## `useBle()` — `hooks/use-ble.ts`

Manages Web Bluetooth connection to an ESP32 SmartChess board. Used exclusively by the `/device` page.

### Core state

```ts
{
  devices:       BleDevice[];
  connected:     BleDevice | null;
  scanning:      boolean;
  connecting:    string | null;   // boardID being connected
  configuring:   string | null;   // boardID being configured
  terminalLines: TerminalLine[];  // BLE LOG characteristic output
}
```

### Key operations
- `scanDevices()` — Web Bluetooth `requestDevice()` with SmartChess service UUID filter
- `connectDevice(device)` — GATT connect, subscribe to LOG notifications
- `sendCommand(cmd)` — Write to CMD characteristic
- `readStatus()` — Read STATUS from CMD characteristic
- `scanNetworks()` — Send `WIFI_SCAN` command, parse network list from LOG
- `flashFirmware(file)` — OTA upload via chunked BLE writes with progress reporting

**Note**: Web Bluetooth requires HTTPS or `localhost`, and is only supported in Chrome/Edge desktop.
