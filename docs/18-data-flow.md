# 18 — Data Flow Diagrams

---

## A. Game creation

```
Browser or ESP32
     │
     │  POST /games { gameID: "game_alpha" }
     ▼
GameController.create()
     │
     ├─► game.manager.createGame("game_alpha")
     │       → games.set("game_alpha", new Chess())
     │       → lastAccessed.set("game_alpha", Date.now())
     │
     ├─► models.saveGame("game_alpha", initialState)
     │       → MongoDB: games.updateOne(
     │           { _id: "game_alpha" },
     │           { $set: { fen: "start", pgn: "", lastSeq: 0, ... } },
     │           { upsert: true }
     │         )
     │
     └─► getIO().to("game_alpha").emit("board_connected", { gameID })
             → All clients in room "game_alpha" receive board_connected
     │
     ▼
Response 200: { status: "Game created", gameID: "game_alpha" }
```

---

## B. Move from physical board (ESP32)

```
ESP32 sensor detects piece movement
     │
     │  POST /moves { uci: "e2e4", gameID: "game_alpha", seq: 1 }
     ▼
moveRouter handler
     │
     ├─► Parse candidates: ["e2e4"]
     │
     ├─► makeMove("game_alpha", ["e2e4"], 1)
     │       │
     │       ├── evictStaleGames()
     │       ├── [not in RAM] → restorefromDB() → load from MongoDB
     │       ├── seq check: 1 === lastSeq(0) + 1 → OK
     │       ├── no active branches
     │       ├── findValidMove(game, ["e2e4"]) → [{ from:"e2", to:"e4" }]
     │       ├── game.move({ from:"e2", to:"e4" })
     │       └── gameSeq.set("game_alpha", 1)
     │
     │  Returns: { status:"ok", fen:"...", pgn:"1. e4", lastSeq:1, lastMove:{...} }
     │
     ├─► stockfishService.evaluate(fen, onEval)
     │       │
     │       │  Engine runs at depth 1, 2, 3 ... 15
     │       │  At each depth: onEval(cp) fires
     │       │                     │
     │       │                     └─► getIO().to("game_alpha").emit("eval_bestmove", { cp })
     │       │                             → browsers receive cp updates in real-time
     │       │
     │       └─► Resolves with { bestMove: "e7e5" } at depth 15
     │
     ├─► models.saveGame("game_alpha", state)
     │       → MongoDB upsert: { fen, pgn, lastMove, lastSeq: 1, updateAt: now }
     │
     └─► getIO().to("game_alpha").emit("esp_move", state)
             → All browsers in room receive: { gameID, fen, pgn, lastMove }
     │
     ▼
Response 200: { status:"ok", fen, pgn, lastSeq:1, lastMove }
```

---

## C. Browser — board page load and live updates

```
User navigates to /board?id=Z2FtZV9hbHBoYQ==
     │
     │  Next.js decodes: gameID = "game_alpha"
     ▼
useGame("game_alpha") mounts
     │
     ├─► fetchJSONCached("/games/game_alpha", 1500)
     │       → Next.js rewrites → GET http://localhost:8080/games/game_alpha
     │       → Response: ActiveGame { fen, pgn, WhiteName, BlackName, ... }
     │       → patchBoard("game_alpha", data) → Zustand store
     │       → isLoaded = true
     │
     ├─► socket.emit("join", { gameID: "game_alpha" })
     │       → Server: socket.join("game_alpha")
     │
     ├─► socket.emit("request_current_game", { gameID: "game_alpha" })
     │       → Server: socket.emit("restore_game", { fen, lastMove, ... })
     │       → Client: patchBoard("game_alpha", restored state)
     │
     └─► socket.emit("request_eval", { gameID, fen })
             → Server queues Stockfish eval
             → Streams "eval_realtime" events back
     │
     ▼
React renders:
  ChessBoardView(fen, boardWidth)
  EvalBar(cp)
  GamePanel(pgn, whiteName, blackName, status)
     │
     │  ResizeObserver on board wrapper (useEffect([isLoaded]))
     │  Measures clientWidth → sets boardWidth → Chessboard renders correct size
     │
     ▼ ── Live updates ──────────────────────────────────────────────────────────

ESP32 makes a move → Server emits "esp_move" → room "game_alpha"
     │
     └─► useGame listener:
             socket.on("esp_move", ({ fen, pgn, lastMove }) => {
               patchBoard("game_alpha", { fen, pgn, lastMove, status: "playing" });
             })
             │
             └─► Zustand state updates → React re-renders board with new position
```

---

## D. Game end — resign

```
User clicks "Resign" → selects "White resigns" → confirms
     │
     │  POST /games/game_alpha/resign { resignSide: "white" }
     │  (via useGame.resign("white"))
     ▼
GameActionController.resign()
     │
     └─► GameResignService.handle("game_alpha", "white")
             │
             ├─► loadGame("game_alpha") from MongoDB
             │       → { fen, pgn, WhiteName, BlackName, createdAt, ... }
             │
             ├─► Compute Result = "0-1"  (white resigned, black wins)
             │
             ├─► Build final PGN:
             │       [White "Trần Minh"][Black "Lê Hoàng"][Result "0-1"][Date "..."]
             │       1. e4 e5 2. Nf3 Nc6 ...  0-1
             │
             ├─► durationSec = (now - createdAt) / 1000
             │
             ├─► models.endGame(doc)
             │       → MongoDB: pgn_games.insertOne({
             │           gameID, pgn, Result:"0-1", White, Black, Date,
             │           totalMoves, createAt, endedAt: now, durationSec,
             │           endReason:"resigned", winner:"black", loser:"white"
             │         })
             │
             ├─► game.manager.resetGame("game_alpha")
             │       → chess.reset(), gameSeq = 0
             │
             └─► models.saveGame("game_alpha", blank)
                     → MongoDB: games.updateOne — blank FEN, empty PGN
     │
     ▼
Response 200: { message:"Game over", winner:"black", result:"0-1", loser:"white" }
     │
     ▼
useGame.resign() client-side:
  patchBoard("game_alpha", { status: "ended" })
  invalidateFetchCache("/games")   ← forces fresh fetch next time
```

---

## E. Multi-candidate move (branch resolution)

```
ESP32 reports ambiguous move (two pieces lifted):
     │
     │  POST /moves { uci: "MULTI:e2e4,d2d4", gameID: "game_alpha", seq: 1 }
     ▼
makeMove("game_alpha", ["e2e4", "d2d4"], 1)
     │
     ├─► findValidMove(game, ["e2e4", "d2d4"])
     │       → both e2e4 and d2d4 are legal → validMoves.length = 2
     │
     ├─► Create branches:
     │       branch_0: Chess() after 1. e4   ← committed to mainGame
     │       branch_1: Chess() after 1. d4
     │       activeBranches.set("game_alpha", [branch_0, branch_1])
     │
     └─► Return { status:"ok", ambiguity:true, branches:2, fen: after-e4 }
     │
     ▼  (next move from ESP32)
     │
     │  POST /moves { uci: "e7e5", gameID: "game_alpha", seq: 2 }
     ▼
makeMove("game_alpha", ["e7e5"], 2)
     │
     ├─► activeBranches exists → resolveBranches()
     │
     │   branch_0 (after e4): try e7e5 → legal ✓ → survives
     │   branch_1 (after d4): try e7e5 → legal ✓ → survives
     │
     └─► Still 2 branches → ambiguity continues
     │
     ▼  (later move)
     │
     │  POST /moves { uci: "d7d5", ... seq: 3 }
     ▼
     │   branch_0 (e4 e5): try d7d5 → legal ✓ → survives
     │   branch_1 (d4 e5): try d7d5 → legal ✓ → survives
     │
     │  ... ambiguity resolved when a move is only legal in one branch ...
     │
     │   POST /moves { uci: "f7f5", ... }
     │   branch_0 (e4 e5 d5): try f7f5 → legal ✓
     │   branch_1 (d4 e5 d5): try f7f5 → illegal ✗ → eliminated
     │
     ├─► surviving = [branch_0]
     ├─► mainGame.loadPgn(branch_0.pgn)
     ├─► activeBranches.delete("game_alpha")
     └─► Return { status:"ok", isCorrection: false, lastMove: {f7, f5} }
```
