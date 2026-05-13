import { createServer } from "http";
import { setServers as dnsSetServers } from "node:dns/promises";
import express from "express";
import cors from "cors";
import os from "os";

dnsSetServers(["1.1.1.1", "8.8.8.8"]);
import { connectDB } from "./config/database.js";
import { env, ALLOWED_ORIGINS } from "./config/environment.js";
import { initSocket } from "./sockets/index.js";
import { stockfishService } from "./services/stockfish.instance.js";
import { gameRouter } from "./routes/game.route.js";
import { moveRouter } from "./routes/move.route.js";
import { evalRouter } from "./routes/eval.route.js";
import { boardRouter } from "./routes/board.route.js";
import { Chess } from "chess.js";
import { games, gameSeq, updateLastAccess } from "./game/game.manager.js";
import { saveGame } from "./models/game.model.js";
import { getIO } from "./sockets/index.js";
import { invalidateCached } from "./utils/response.cache.js";

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  if (interfaces["Wi-Fi"]) {
    for (const iface of interfaces["Wi-Fi"]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  for (const ifaces of Object.values(interfaces)) {
    for (const iface of ifaces) {
      if (iface.family === "IPv4" && !iface.internal && !iface.address.startsWith("192.168.56."))
        return iface.address;
    }
  }
  return "127.0.0.1";
}

async function startServer() {
  const app    = express();
  const server = createServer(app);

  app.use(cors({
    origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : "*",
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (_, res) => res.json({ ok: true }));

  // ── FEN history store — reconstruct PGN from FEN sequence ─────────────
  const fenHistoryStore = new Map(); // gameID → [fen, ...]

  /**
   * Try to find the chess move (from→to) that connects prevFen → nextFen.
   * Returns null if no single legal move bridges the gap.
   */
  function findMoveBetweenFens(prevFen, nextFen) {
    try {
      const c = new Chess();
      c.load(prevFen);
      const moves = c.moves({ verbose: true });
      for (const m of moves) {
        c.load(prevFen);
        c.move({ from: m.from, to: m.to, promotion: m.promotion });
        if (c.fen() === nextFen) {
          return { from: m.from, to: m.to, promotion: m.promotion ?? null, uci: `${m.from}${m.to}${m.promotion ?? ""}` };
        }
      }
    } catch {}
    return null;
  }

  /**
   * Rebuild PGN string from a list of FEN positions.
   */
  function buildPGNFromFens(fens) {
    if (fens.length < 2) return "";
    try {
      const c = new Chess();
      c.load(fens[0]);
      for (let i = 1; i < fens.length; i++) {
        const move = findMoveBetweenFens(c.fen(), fens[i]);
        if (!move) break;
        c.move({ from: move.from, to: move.to, promotion: move.promotion });
      }
      return c.pgn();
    } catch {
      return "";
    }
  }

  // ── FEN from physical board ──────────────────────────────────────────
  app.post("/fen", async (req, res) => {
    const { fen, gameID, boardID, seq } = req.body;
    if (!fen || !gameID) {
      return res.status(400).json({ error: "Missing fen or gameID" });
    }

    // Validate FEN
    try {
      new Chess(fen);
    } catch {
      return res.status(422).json({ error: "Invalid FEN" });
    }

    // Update in-memory game state
    if (games.has(gameID)) {
      try {
        const game = games.get(gameID);
        game.load(fen);
        if (seq !== undefined) gameSeq.set(gameID, seq);
      } catch (e) {
        console.warn(`[FEN] Load into game ${gameID}: ${e.message}`);
      }
    }
    updateLastAccess(gameID);

    // ── Reconstruct PGN from FEN sequence ─────────────────────────────
    if (!fenHistoryStore.has(gameID)) fenHistoryStore.set(gameID, []);
    const history = fenHistoryStore.get(gameID);

    if (history.length === 0) {
      try {
        const start = new Chess().fen();
        if (fen !== start && findMoveBetweenFens(start, fen)) {
          history.push(start);
        }
      } catch {}
    }

    // Dedupe: skip if same as last FEN
    if (history.length > 0 && history[history.length - 1] === fen) {
      const pgn = buildPGNFromFens(history);
      try { if (games.has(gameID)) games.get(gameID).loadPgn(pgn); } catch {}
      const lastMove = history.length >= 2
        ? findMoveBetweenFens(history[history.length - 2], history[history.length - 1])
        : null;

      const io = getIO();
      io.to(gameID).emit("esp_move", {
        status: "ok", gameID, fen, pgn, lastMove,
        fenHistory: history,
        lastSeq: seq ?? gameSeq.get(gameID) ?? 0,
        boardID: boardID ?? null, movedAt: Date.now(),
      });
      return res.json({ ok: true, gameID, fen, pgn, fenHistory: history });
    }

    history.push(fen);

    // Build PGN (best-effort — may be empty if FEN sequence is invalid)
    const pgn = buildPGNFromFens(history);
    const lastMove = history.length >= 2
      ? findMoveBetweenFens(history[history.length - 2], history[history.length - 1])
      : null;

    // Also keep the in-memory chess.js game in sync via PGN so history works
    try { if (games.has(gameID)) games.get(gameID).loadPgn(pgn); } catch {}

    const lastSeq = seq ?? gameSeq.get(gameID) ?? 0;
    const movedAt = Date.now();

    // Broadcast via Socket.IO immediately (low-latency UI path)
    const io = getIO();
    io.to(gameID).emit("esp_move", {
      status: "ok", gameID, fen, pgn, lastMove,
      fenHistory: history,
      lastSeq, boardID: boardID ?? null, movedAt,
    });
    io.emit("game:move", { gameID, fen, lastMove });

    // Persist asynchronously so DB latency does not block realtime updates
    saveGame(gameID, {
      gameID, fen, pgn, lastSeq,
      fenHistory: history,
      boardID: boardID ?? null,
      movedAt,
    })
      .then(() => {
        invalidateCached("games:");
        invalidateCached(`games:item:${gameID}`);
      })
      .catch(e => console.error("[FEN] DB save error:", e));

    res.json({ ok: true, gameID, fen, pgn });
  });

  app.use("/games",  gameRouter);
  app.use("/moves",  moveRouter);
  app.use("/boards", boardRouter);
  app.use("/",       evalRouter);

  try {
    await connectDB();
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }

  initSocket(server);
  stockfishService.init();

  const host = "0.0.0.0";
  const requestedPort = Number(env.PORT) || 8080;

  function listenWithFallback(port, retriesLeft = 10) {
    server.once("error", (err) => {
      if (err?.code === "EADDRINUSE" && retriesLeft > 0) {
        const nextPort = port + 1;
        console.warn(`[BOOT] Port ${port} busy, retrying on ${nextPort}...`);
        listenWithFallback(nextPort, retriesLeft - 1);
        return;
      }
      throw err;
    });

    server.listen(port, host, () => {
      const ip = getLocalIp();
      console.log(`Express running on:`);
      console.log(`  Local:   http://localhost:${port}`);
      console.log(`  Network: http://${ip}:${port}`);
    });
  }

  listenWithFallback(requestedPort);
}

startServer();
