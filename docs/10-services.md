# 10 — Server Services Layer

Services implement business logic. Controllers call services; services call the game manager, models, and socket emitter.

---

## `game.service.js`

### `GameService.create(gameID)`

Full game creation workflow:

```
1. game.manager.createGame(gameID)
   → new Chess() stored in RAM maps

2. models.saveGame(gameID, initialState)
   → upsert to MongoDB games collection
   initial state: { fen: "start", pgn: "", lastMove: null, lastSeq: 0,
                    WhiteName: "White", BlackName: "Black", createdAt: now }

3. getIO().to(gameID).emit("board_connected", { gameID })
   → notify browser clients in room
```

---

## `game.action.service.js`

### `restart(gameID)`

```
1. game.manager.resetGame(gameID)   → chess.reset(), seq = 0
2. models.saveGame(gameID, blank)   → overwrite in MongoDB
3. emit "update_all_game" { gameID } → browser clients re-fetch
```

### `reset(gameID)`

Alias for `restart`. Same behaviour.

### `rename(gameID, color, name)`

```
color must be "White" or "Black" (validated)
name must be a non-empty string (validated)

1. models.renamePlayer(gameID, color, name)
   → updateOne({ _id: gameID }, { $set: { [color + "Name"]: name } })

2. emit "game:renamed" { gameID, WhiteName, BlackName }
```

### `destroy(gameID)`

```
1. models.removeGame(gameID)    → deleteOne from games collection
2. game.manager.destroyBoard(gameID)  → remove from all RAM maps
```

---

## `game.resign.service.js`

### `handle(gameID, resignSide)`

The most complex service — archives a completed game.

```
resignSide: "white" | "black" | "draw"

1. Load game from MongoDB: loadGame(gameID)

2. Compute Result string:
   "white" → Result = "0-1"   (white resigns, black wins)
   "black" → Result = "1-0"   (black resigns, white wins)
   "draw"  → Result = "1/2-1/2"

3. Build final PGN with injected headers:
   [White "..."]
   [Black "..."]
   [Result "1-0"]
   [Date "YYYY.MM.DD"]
   ... + existing moves

4. Calculate durationSec:
   (Date.now() - game.createdAt.getTime()) / 1000

5. endGame(doc) → insertOne to pgn_games:
   doc = { gameID, pgn, Result, White, Black, Date, totalMoves,
           createAt, endedAt, durationSec, endReason: "resigned",
           winner, loser }

6. game.manager.resetGame(gameID) → clear board in RAM

7. models.saveGame(gameID, blank) → save cleared state to MongoDB

8. Return { message: "Game over", winner, result, loser }
```

---

## `chess.service.js`

Thin wrappers around chess.js for testability and reuse.

### `ChessService.findValidMove(game, candidates)`

```js
// candidates: string[]  e.g. ["e2e4", "e2e3"]
// game: Chess instance

candidates
  .map(uci => ({
    from: uci.slice(0, 2),
    to:   uci.slice(2, 4),
    promotion: uci.length === 5 ? uci[4] : undefined
  }))
  .filter(({ from, to, promotion }) => {
    // Attempt the move on a clone; if it succeeds, it's valid
    const temp = new Chess(); temp.loadPgn(game.pgn());
    return temp.move({ from, to, promotion }) !== null;
  })
```

Returns `Move[]` — all candidates that are legal in the current position.

### `ChessService.applyMove(game, from, to, promotion)`

Applies the move to the given `Chess` instance. Returns the move result or `null` if illegal.

### `ChessService.cloneFromFen(fen)`

Returns `new Chess(fen)` — a fresh instance loaded from a FEN string.

---

## `board.service.js`

Validates the physical chess board initial setup from the ESP32 Hall sensor array.

### `convertHalltoBoard(hallArr)`

```
Input:  number[64]  — flat Hall sensor values (1 = piece, 0 = empty)
Output: string[][]  — 8×8 board representation
```

Converts from ESP32's linear sensor output to a 2D board array.

### `checkInitialBoard(board)`

Compares the detected board state against the standard chess starting position.

```
Returns:
{
  status:         "ok" | "error",
  wrongSquares:   string[]   // squares with unexpected piece presence
  missingSquares: string[]   // squares where a piece should be but isn't
}
```

---

## `initcheck.service.js`

Simple in-memory store for per-game initialization check results.

```js
const store = new Map();  // gameID → result

save(gameID, result)  → store.set(gameID, result)
get(gameID)           → store.get(gameID)
clear(gameID)         → store.delete(gameID)
```

Results persist in memory until the server restarts or `clear()` is called.

---

## Service call chain summary

```
REST request
     │
     ▼
Controller   (validates request shape, calls service, returns response)
     │
     ▼
Service      (business logic, orchestrates model + manager + socket)
     │
     ├──► game.manager   (RAM state, chess.js, branch resolution)
     ├──► model          (MongoDB queries)
     └──► getIO().emit() (Socket.io broadcast)
```
