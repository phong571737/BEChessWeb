# 07 — Socket.io Events

Socket.io server runs on the **same port as Express (8080)**.  
Transport: WebSocket with polling fallback.

---

## Room model

Each `gameID` is a Socket.io room. A client must emit `join` before receiving game-specific events.  
Some events (heartbeat, offline, game:created) are emitted **globally** to all connected sockets.

```
Client A ─── join { gameID } ──► room "game_alpha"
Client B ─── join { gameID } ──► room "game_alpha"
ESP32 ────── POST /boards/heartbeat (REST) ──► server emits board_heartbeat globally

Server ─── "esp_move" to room "game_alpha" ──► Client A + Client B
Server ─── "board_heartbeat"  to all sockets ──► Client A + Client B + home page
```

**Important**: clients on the `/board` page emit `join` as soon as `socket` and `gameID` are available — **before** `isLoaded` is true. This ensures scan events arrive immediately while the `waiting_scan` overlay is showing.

---

## Client → Server

### `join`
```ts
socket.emit("join", { gameID: "game_alpha" });
```

### `request_current_game`
Request FEN + lastMove for a game (used to restore state on reconnect).
```ts
socket.emit("request_current_game", { gameID: "game_alpha" });
// Server responds with "restore_game" to this socket only
```

### `request_eval`
Request a Stockfish evaluation. Responses stream as `eval_update` events.
```ts
socket.emit("request_eval", { gameID: "game_alpha", fen: "rnbq..." });
```

### `esp_move`
Send a move via socket (legacy — prefer `POST /moves` from ESP32).
```ts
socket.emit("esp_move", { gameID: "game_alpha", uci: "e2e4" });
```

### `resign`
```ts
socket.emit("resign", { gameID: "game_alpha", resignSide: "white" });
```

### `restart`
```ts
socket.emit("restart", { gameID: "game_alpha" });
```

---

## Server → Client

### Global events (all connected sockets)

#### `board_heartbeat`
Emitted after every `POST /boards/heartbeat`. Used by the home page to maintain the physical boards list.

```ts
{
  boardID: "ESP32-AA:BB:CC",
  gameID:  "game_alpha" | null,
  online:  true
}
```

`online: false` is emitted by `DELETE /boards/:boardID/disconnect` (graceful shutdown).

---

#### `board_offline`
Emitted globally when a board is removed (TTL expiry or graceful disconnect). Also emitted to the game room if a game was linked.

```ts
{ boardID: "ESP32-AA:BB:CC", gameID: "game_alpha" | null }
```

---

#### `game:created`
Emitted after `POST /games` succeeds. Home page uses this to refresh the game list.

```ts
{ gameID: "game_alpha" }
```

---

#### `game_status_update`
Emitted after game status changes (scan result received, rescan triggered). Also emitted to the game room.

```ts
{ gameID: "game_alpha", status: "waiting_scan" | "scan_failed" | "active" }
```

---

### Game room events (only sockets that joined the room)

#### `board_scan_ok`
Emitted when `POST /boards/scan-result` receives `result: "STARTED"`. The `waiting_scan` overlay transitions to the live game view.

```ts
{ gameID: "game_alpha", boardID: "ESP32-AA:BB:CC" }
```

---

#### `board_scan_failed`
Emitted when `POST /boards/scan-result` receives `result: "MISSING"` or `"DUPLICATE"`.

```ts
{
  gameID:  "game_alpha",
  boardID: "ESP32-AA:BB:CC",
  reason:  "MISSING" | "DUPLICATE",
  missing: ["a1", "h8"]          // populated for MISSING; empty for DUPLICATE
}
```

---

#### `board_alert`
Emitted when `POST /boards/alert` is received. The board page shows an auto-dismissing toast.

```ts
{
  gameID:  "game_alpha",
  boardID: "ESP32-AA:BB:CC",
  code:    "WRONG_TURN",          // see alert code table in 06-api-rest.md
  detail:  "from=e2"
}
```

---

#### `board_connected`
Legacy event emitted in some code paths when a physical board is confirmed active.

```ts
{ gameID: "game_alpha" }
```

---

#### `restore_game`
Sent to the requesting socket only in response to `request_current_game`.

```ts
{
  gameID:    "game_alpha",
  fen:       "rnbq...",
  pgn?:      "1. e4 e5",
  lastMove?: { from: "e7", to: "e5", uci: "e7e5" },
  WhiteName?: "Trần Minh",
  BlackName?: "Lê Hoàng"
}
```

---

#### `esp_move`
Emitted to the game room after every accepted move.

```ts
{
  gameID:   "game_alpha",
  fen:      "rnbq...",
  pgn?:     "1. e4 e5",
  lastMove: { from: "e2", to: "e4", uci: "e2e4" },
  movedAt?: number   // Unix ms timestamp
}
```

---

#### `eval_update`
Emitted during Stockfish analysis (multiple per position as depth increments).

```ts
{ gameID: "game_alpha", cp: 42 }
```

`cp` is centipawns, positive = White advantage.

---

#### `eval_realtime`
Same shape as `eval_update`, emitted via the socket `request_eval` path.

```ts
{ gameID: "game_alpha", cp: -15 }
```

---

#### `game:renamed`
Emitted after `POST /games/:id/rename`. Only the changed side is included.

```ts
// White renamed:
{ gameID: "game_alpha", WhiteName: "Magnus" }
// Black renamed:
{ gameID: "game_alpha", BlackName: "Lê Hoàng" }
```

---

#### `update_all_game`
Emitted after restart. Clients reset their local game state entirely.

```ts
{ gameID: "game_alpha" }
```

---

#### `initcheck`
Emitted after Hall-sensor board validation (legacy path).

```ts
{ gameID: "game_alpha", status: "error", wrongSquares: ["e2"], missingSquares: [] }
```

---

## TypeScript types — `client/types/socket.types.ts`

```ts
interface ClientToServerEvents {
  "join":                 { gameID: string };
  "request_current_game": { gameID: string };
  "esp_move":             { gameID: string; uci: string };
  "request_eval":         { gameID: string; fen: string };
  "resign":               { gameID: string; resignSide: "white" | "black" };
  "restart":              { gameID: string };
}

interface ServerToClientEvents {
  // Global (all sockets)
  "board_heartbeat":    { boardID: string; gameID: string | null; online: boolean };
  "board_offline":      { boardID: string; gameID: string | null };
  "game:created":       { gameID: string };
  "game_status_update": { gameID: string; status: "waiting_scan" | "scan_failed" | "active" };

  // Game room
  "board_scan_ok":      { gameID: string; boardID: string };
  "board_scan_failed":  { gameID: string; boardID: string; reason: "MISSING" | "DUPLICATE"; missing: string[] };
  "board_alert":        { gameID: string; boardID: string; code: string; detail: string };
  "board_connected":    { gameID: string };
  "restore_game":       { gameID: string; fen: string; pgn?: string; lastMove?: MoveData | null; WhiteName?: string; BlackName?: string };
  "esp_move":           { gameID: string; lastMove: MoveData; fen: string; pgn?: string; movedAt?: number };
  "eval_update":        { gameID: string; cp: number };
  "eval_realtime":      { gameID: string; cp: number };
  "game:renamed":       { gameID: string; WhiteName?: string; BlackName?: string };
  "update_all_game":    { gameID: string };
  "initcheck":          { gameID: string; status: string };
}

interface MoveData {
  from:       string;
  to:         string;
  promotion?: string;
  uci?:       string;
}
```

---

## Socket.io server init — `server/sockets/index.js`

```js
export function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(",") ?? ["http://localhost:3000"],
      methods: ["GET", "POST"]
    }
  });
  // Registers game.socket handlers (join, request_current_game, esp_move, etc.)
  // Registers eval.socket handlers (request_eval → eval_update stream)
}

export function getIO() { return io; }  // used by routes to emit
```
