# 08 — Game Engine — Core Logic

**File**: `server/game/game.manager.js`

---

## In-memory state

All active games are held in four `Map` instances (module-level singletons):

```js
games          = new Map()  // gameID → Chess instance (chess.js)
gameSeq        = new Map()  // gameID → last accepted seq number
activeBranches = new Map()  // gameID → Branch[] (ambiguous moves)
lastAccessed   = new Map()  // gameID → timestamp ms (LRU eviction)
```

---

## Stale game eviction

`evictStaleGames()` is called at the **start of every `makeMove()`** call.

Any game not accessed within `EVICTION_TIMEOUT` (30 minutes) is removed from all four maps. The game document in MongoDB is not deleted — it is restored to RAM on next access via `restorefromDB()`.

```js
const EVICTION_TIMEOUT = 30 * 60 * 1000;  // 30 min in ms
```

---

## Move pipeline — `makeMove(gameID, candidates, seq)`

```
┌─ Step 1: evictStaleGames()

┌─ Step 2: Restore from DB if not in RAM
│   if (!games.has(gameID)):
│     game = await restorefromDB(gameID)
│     if (!game) → return { status: "not_found" }

┌─ Step 3: Sequence check
│   expectedSeq = gameSeq.get(gameID) + 1
│   if seq < expectedSeq → return { status: "duplicate", fen, lastSeq }
│   if seq > expectedSeq → return { status: "out_of_order", expectedSeq }

┌─ Step 4: Branch resolution (if active branches exist)
│   if activeBranches.has(gameID):
│     result = resolveBranches(gameID, mainGame, candidates)
│     if result.status != "ok" → return { ...result, lastSeq }
│     gameSeq.set(gameID, seq)
│     return { status: "ok", fen, pgn, lastSeq, isCorrection, correctionPGN, lastMove }

┌─ Step 5: Normal move (no active branches)
│   validMoves = ChessService.findValidMove(mainGame, candidates)
│
│   if validMoves.length === 0 → return { status: "illegal" }
│
│   if validMoves.length > 1:
│     Create branches (one Chess clone per valid move)
│     Store in activeBranches
│     Apply first branch to mainGame (optimistic commit)
│     return { status: "ok", ambiguity: true, branches: N, lastMove: first }
│
│   if validMoves.length === 1:
│     Apply move to mainGame directly

└─ Step 6: Update seq, return { status: "ok", fen, pgn, lastSeq, lastMove }
```

---

## Branch resolution — `resolveBranches(gameID, mainGame, candidates)`

### Why it exists

ESP32 Hall sensors detect whether a square is occupied. When a player picks up one piece and lifts another momentarily, the sensor fires two "piece lifted" events, resulting in two candidate UCIs (e.g. `["e2e4", "d2d4"]`). The engine cannot know which was the intended move until the next move is made.

### Algorithm

```
Input: active branches[] from a previous ambiguous move
       new candidates[] from current ESP32 signal

For each branch:
  Try each candidate UCI on the branch's chess position.
  If the candidate is a legal move in that branch → branch survives.
  Otherwise → branch is eliminated.

After pruning:
  surviving.length === 0 → return { status: "illegal" }

  surviving.length === 1:
    mainGame.loadPgn(surviving[0].pgn)  ← correct the main game
    activeBranches.delete(gameID)       ← ambiguity resolved
    isCorrection = (surviving[0].id !== branches[0].id)
    ↳ true = the optimistic first branch was wrong, PGN was corrected

  surviving.length > 1:
    activeBranches.set(gameID, surviving)  ← still ambiguous, wait for more
    mainGame.loadPgn(surviving[0].pgn)
```

### Example

```
Move 1: candidates = ["e2e4", "d2d4"]
  Both are legal → create 2 branches:
    branch_0: 1. e4  (committed to mainGame)
    branch_1: 1. d4

Move 2: candidates = ["e7e5"]
  branch_0 after e4: e5 is legal   → survives
  branch_1 after d4: e5 is legal   → also survives → still ambiguous

Move 2: candidates = ["d7d5"]
  branch_0 after e4: d5 is legal   → survives
  branch_1 after d4: d5 is legal   → also survives → still ambiguous

Move 2: candidates = ["c7c5"]
  branch_0 after e4: c5 is legal   → survives
  branch_1 after d4: c5 is legal   → also survives → still ambiguous

→ Eventually a move will eliminate one branch, resolving the ambiguity.
```

---

## Other exported functions

### `createGame(gameID)`
Creates a new `Chess()` instance and stores it. No-op if the game already exists in RAM.

### `resetGame(gameID)`
Calls `chess.reset()` on the in-memory instance. Sets `gameSeq` to 0. Creates the game in RAM if it doesn't exist.

### `destroyBoard(gameID)`
Removes the game from all four maps. **Does not touch MongoDB** — caller must also call `removeGame()` from the model layer.

### `restorefromDB(gameID)`
```js
const data = await loadGame(gameID);
const game = new Chess();
if (data.pgn) game.loadPgn(data.pgn);
else if (data.fen) game.load(data.fen);
games.set(gameID, game);
gameSeq.set(gameID, data.lastSeq ?? 0);
return game;
```

Reconstructs a full chess.js instance from the persisted PGN (preferred) or FEN.

### `getCurrentState(gameID)`
Returns `{ gameID, fen, lastMove: null }` from RAM, or restores from DB if needed. Used by the socket's `request_current_game` handler.

### `loadPGN(gameID, pgn)`
Replaces the PGN in the in-memory Chess instance. Used by `POST /games/:id/pgn`.

---

## Sequence number (`seq`)

The `seq` field in `POST /moves` is a monotonically increasing counter sent by the ESP32 for **each physical move**. It prevents duplicate and out-of-order processing:

- ESP32 increments `seq` before sending.
- Server stores `lastSeq` and computes `expectedSeq = lastSeq + 1`.
- `seq === expectedSeq` → accept.
- `seq < expectedSeq` → already applied, return cached state.
- `seq > expectedSeq` → missed a move, ESP32 must retry the missing sequence.
