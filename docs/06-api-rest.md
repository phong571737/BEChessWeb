# 06 — REST API Reference

All routes are served by Express on **port 8080**.  
In the browser, requests go through Next.js rewrites (port 3000 → 8080 server-side, no CORS needed).

---

## Games — `/games`

### `POST /games`
Create a new game, optionally linked to a physical board.

**Body**
```json
{
  "gameID":    "game_alpha",
  "WhiteName": "Trần Minh",
  "BlackName": "Lê Hoàng",
  "boardID":   "ESP32-AA:BB:CC"
}
```

All fields are optional. If `gameID` is omitted a slug is auto-generated (`game_<timestamp36>`).  
If `boardID` is provided:
- Game is created with `status: "waiting_scan"`.
- The board registry entry is updated with this `gameID`.
- A `START` command is queued in `pendingCommands` for delivery on the board's next heartbeat.
- `board_heartbeat` is emitted globally with `{ boardID, gameID, online: true }`.

If `boardID` is omitted, `status: "active"` is used directly.

**Response `200`**
```json
{ "status": "Game created", "gameID": "game_alpha" }
```

**Side effects**: `game.manager.createGame()` → `saveGame()` → emit `game:created` (global).

---

### `GET /games/current`
Get all active (non-finished) games.

**Response `200`** — `ActiveGame[]`  
Server cache: **2 s**

```json
[
  {
    "_id": "game_alpha",
    "gameID": "game_alpha",
    "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    "pgn": "1. e4",
    "lastMove": { "from": "e2", "to": "e4", "uci": "e2e4" },
    "lastSeq": 1,
    "WhiteName": "Trần Minh",
    "BlackName": "Lê Hoàng",
    "status": "active",
    "createdAt": "2025-05-01T10:00:00.000Z"
  }
]
```

---

### `GET /games/history`
Get all completed games, sorted newest-first.

**Response `200`** — `HistoryGame[]`  
Server cache: **10 s**

---

### `DELETE /games/history/:id`
Delete a completed game by MongoDB ObjectId.

**Response `200`**: `{ "success": true }`

---

### `GET /games/:id`
Get a single game by gameID. Returns full document including `status`, `scanMissing`, `scanReason`.

Server cache: **2 s**

---

### `POST /games/:id/rescan`
Reset a game's scan state and re-queue the `START` command for the linked physical board.

**Response `200`**: `{ "ok": true }`

**Side effects**:
- `saveGame(gameID, { status: "waiting_scan", scanMissing: [], scanReason: null })`
- Invalidates caches
- `setGamePendingCommand(gameID, "START")` — delivered on next heartbeat
- `getIO().emit("game_status_update", { gameID, status: "waiting_scan" })` — global broadcast

---

### `POST /games/:id/pgn`
Update a game's PGN from the browser editor.

**Body**
```json
{ "pgn": "1. e4 e5 2. Nf3", "fen": "...", "lastMove": { "from": "f1", "to": "c4" } }
```

**Response `200`**: `{ "ok": true }`

---

### `POST /games/:id/restart`
Reset board to starting position (keeps the game, clears moves).

**Response `200`**: `{ "ok": true }`  
**Side effects**: `resetGame()` → `saveGame()` blank state → emit `update_all_game` to game room.

---

### `POST /games/:id/resign`
Record game result and archive to history.

**Body**
```json
{ "resignSide": "white" }
```

`resignSide` values: `"white"` → Result `"0-1"`, `"black"` → Result `"1-0"`, `"draw"` → Result `"1/2-1/2"`.

---

### `POST /games/:id/reset`
Reset board state without archiving.

---

### `POST /games/:id/destroy`
Delete game from both DB and RAM.

---

### `POST /games/:id/rename`
Update a player's display name.

**Body**
```json
{ "color": "White", "name": "Magnus Carlsen" }
```

**Side effects**: emit `game:renamed` to game room with `{ gameID, WhiteName? }` or `{ gameID, BlackName? }` (only the changed side is included).

---

### `POST /games/:id/endgame`
Manually save a final PGN to history.

**Body**
```json
{ "pgn": "[White \"...\"]...[Result \"1-0\"] 1. e4 ..." }
```

---

### `POST /games/:id/initcheck`
Validate ESP32 board state against the standard starting position (Hall-sensor path, legacy).

**Body**
```json
{ "board": [1,1,...] }
```

**Response `200`**: `{ "gameID", "status": "ok"|"error", "wrongSquares": [], "missingSquares": [] }`

---

### `GET /games/:id/initcheck`
Retrieve the last stored initcheck result for a game.

---

### `PUT /games/:id/update`
Update game metadata.

**Body**
```json
{ "date": "2025.05.01", "result": "1-0", "pgn": "..." }
```

---

## Boards — `/boards`

Physical board management. ESP32 calls these endpoints over WiFi.

---

### `POST /boards/heartbeat`
Periodic keep-alive from ESP32 (every 5 s in fast mode, 30 s in normal mode).

**Body**
```json
{ "boardID": "ESP32-AA:BB:CC", "gameID": "game_alpha", "ip": "192.168.1.42" }
```

`gameID` and `ip` are optional. If the server has a `gameID` associated with this board (set when a game was created), it is used instead of the client-supplied value.

**Response `200`**
```json
{
  "ok": true,
  "gameID": "game_alpha",
  "command": "START"
}
```

- `gameID` is included only when the server overrides the board's current game.
- `command` is included at most once per game (cleared immediately after delivery — one-shot mechanism via `pendingCommands` Map).

**Side effects**: updates `registry[boardID].lastSeen`, emits `board_heartbeat` globally.

---

### `POST /boards/scan-result`
ESP32 reports result of initial 32-piece scan.

**Body**
```json
{
  "boardID": "ESP32-AA:BB:CC",
  "gameID":  "game_alpha",
  "result":  "STARTED",
  "detail":  ""
}
```

`result` values:
| Value         | Meaning                                                                    |
|---------------|----------------------------------------------------------------------------|
| `"STARTED"`   | All 32 pieces found and unique — game begins                               |
| `"MISSING"`   | One or more squares unreadable — `detail` = comma-separated square names   |
| `"DUPLICATE"` | Duplicate RFID tag detected                                                |

**Side effects**

On `"STARTED"`:
- `saveGame(gameID, { status: "active" })`
- Emit `board_scan_ok` and `game_status_update` to game room.

On `"MISSING"` / `"DUPLICATE"`:
- `saveGame(gameID, { status: "scan_failed", scanMissing: [...], scanReason: result })`
- Emit `board_scan_failed` and `game_status_update` to game room.

**Response `200`**: `{ "ok": true }`

---

### `POST /boards/alert`
ESP32 reports an in-game error (wrong turn, piece lost, illegal destination, etc.).

**Body**
```json
{
  "boardID": "ESP32-AA:BB:CC",
  "gameID":  "game_alpha",
  "code":    "WRONG_TURN",
  "detail":  "from=e2"
}
```

Known `code` values:

| Code                | Trigger                                                    |
|---------------------|------------------------------------------------------------|
| `WRONG_TURN`        | Piece lifted by side not to move                           |
| `NO_LEGAL_DEST`     | No legal destination exists for the lifted piece           |
| `TRACK_TIMEOUT`     | Destination not placed within tracking timeout             |
| `ILLEGAL_DEST`      | Piece placed on a non-legal square                         |
| `PIECE_LOST`        | RFID tag stopped responding mid-move                       |
| `FALLBACK_TIMEOUT`  | Fallback recovery timed out without a legal placement      |

**Side effects**: Emit `board_alert` to game room.

**Response `200`**: `{ "ok": true }`

---

### `DELETE /boards/:boardID/disconnect`
Graceful disconnect notification from ESP32 on shutdown.

**Side effects**:
- Removes board from registry
- Emits `board_heartbeat` with `online: false` (global)
- Emits `board_offline` globally and to game room

**Response `200`**: `{ "ok": true }`

---

### `GET /boards`
Returns all boards active in the last 90 s with their linked game status.

**Response `200`**
```json
[
  {
    "boardID":    "ESP32-AA:BB:CC",
    "gameID":     "game_alpha",
    "gameStatus": "waiting_scan",
    "online":     true,
    "lastSeen":   1714600000000,
    "ip":         "192.168.1.42"
  }
]
```

`gameStatus` is looked up from MongoDB for each linked game. Values: `"waiting_scan"`, `"scan_failed"`, `"active"`, or `null` when no game is linked.

---

## TTL offline detection

A `setInterval` runs every 30 s on the server. Boards silent for more than **90 s** are considered offline:
- Removed from `registry`
- `board_offline` emitted globally and to the game room (if a game was linked)

---

## Evaluation — `/eval`

### `GET /eval?fen=<encoded-FEN>`
Request a Stockfish evaluation for a FEN position.

**Response `200`**: `{ "bestMove": "e2e4" }` (`null` on checkmate/stalemate)

Blocking endpoint (depth-15). For live streaming use the Socket.io `request_eval` event.

---

## Moves — `/moves`

### `POST /moves`
Primary move submission from ESP32 (RFID path, legacy).

**Body**: `{ "uci": "e2e4", "gameID": "game_alpha", "seq": 5 }`

Multi-candidate: `{ "uci": "MULTI:e2e4,e2e3", ... }`

See `08-game-engine.md` for sequence checking and branch resolution logic.
