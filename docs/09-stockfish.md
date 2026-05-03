# 09 — Stockfish Integration

**Files**: `server/services/stockfish.service.js` · `server/services/stockfish.instance.js`

---

## Overview

A single `StockfishService` instance is created at startup and shared across all routes via the singleton export. The engine runs in-process using a WASM build.

```js
// stockfish.instance.js
export const stockfishService = new StockfishService();
```

---

## Initialization

```js
init() {
  this.engine = Stockfish("lite-single", () => {
    this.engine.sendCommand("uci");
    this.engine.sendCommand("isready");
  });

  this.engine.listener = (line) => { /* parse output */ };
}
```

**Mode**: `"lite-single"` — single-threaded WASM build. Lighter than the full multi-threaded version; suitable for a Node.js server where parallelism is handled by the event loop rather than worker threads.

The callback fires after the WASM binary is loaded. Sending `"uci"` + `"isready"` puts the engine into UCI mode.

---

## Evaluation queue

The engine is a single shared resource. Only one position can be analysed at a time. All callers go through a Promise-based queue:

```
State:
  engine  – Stockfish instance
  busy    – boolean (is engine currently running?)
  queue   – Job[]
  _currentJob – the running Job | null

Job shape:
  { fen, onEval, resolve, reject }
```

### `evaluate(fen, onEval?) → Promise<{ bestMove }>`

```js
evaluate(fen, onEval) {
  return new Promise((resolve, reject) => {
    this.queue.push({ fen, onEval, resolve, reject });
    this._processQueue();
  });
}
```

If the engine is busy, the job waits in the queue. If free, `_processQueue()` starts it immediately.

### `_processQueue()`

```js
_processQueue() {
  if (this.busy || this.queue.length === 0) return;
  this.busy = true;
  this._currentJob = this.queue.shift();
  this.engine.sendCommand("ucinewgame");
  this.engine.sendCommand("position fen " + this._currentJob.fen);
  this.engine.sendCommand("go depth 15");
}
```

---

## Engine output parsing

The `engine.listener` callback is called for every line of Stockfish output.

### `score cp <n>` — real-time update

```js
if (line.includes("score cp")) {
  const match = line.match(/score cp (-?\d+)/);
  if (match && this._currentJob?.onEval) {
    this._currentJob.onEval(parseInt(match[1]));
  }
}
```

Called multiple times as depth increments (e.g. depth 1, 2, 3 … 15). Each call fires `onEval(cp)`.

### `bestmove <uci>` — analysis complete

```js
if (line.startsWith("bestmove")) {
  const move = line.split(" ")[1];
  this._currentJob.resolve({
    bestMove: move === "(none)" ? null : move
  });
  this._currentJob = null;
  this.busy = false;
  this._processQueue();  // start next job
}
```

Resolves the Promise and starts the next queued job.

---

## Centipawn convention

`cp` is centipawns from **White's perspective**:
- Positive → White is better
- Negative → Black is better
- 0 → Equal position
- Large values (e.g. ±900) → decisive advantage

The eval bar in the client converts `cp` to a win probability using a sigmoid:

```ts
// components/board/eval-bar.tsx
const winRate = 1 / (1 + Math.exp(-cp / 400));
// winRate = 0.5 at cp=0 (equal)
// winRate → 1.0 as cp → +∞ (White wins)
// winRate → 0.0 as cp → -∞ (Black wins)
```

---

## Usage in the move route

```js
// routes/move.route.js
const bestmove = await stockfishService.evaluate(fen, (cp) => {
  getIO().to(gameID).emit("eval_bestmove", { gameID, cp });
});
```

The `onEval` callback streams centipawn updates to connected browsers in real-time. The `await` resolves when depth 15 is reached.

---

## Depth 15

`go depth 15` is a balance between:
- **Quality**: Depth 15 sees ~6–8 moves ahead, sufficient for instructive analysis.
- **Speed**: Typically completes in under 1 second on modern hardware.
- **Queue pressure**: Since the engine is shared, faster completion means less queue buildup during rapid play.

To change depth: edit `"go depth 15"` in `_processQueue()`.
