import { getPGNCollections, loadAllGame } from "../models/game.model.js";
import { GameService } from "../services/game.service.js";
import { ObjectId } from "mongodb";
import { getCached, invalidateCached, setCached, withCacheHeaders } from "../utils/response.cache.js";
import { getBoardRegistry, setGamePendingCommand } from "../routes/board.route.js";
import { getIO } from "../sockets/index.js";

const CURRENT_CACHE_KEY = "games:current";
const HISTORY_CACHE_KEY = "games:history";
const CURRENT_TTL_MS = 2_000;
const HISTORY_TTL_MS = 10_000;

export const GameController = {

  async create(req, res) {
    try {
      const {
        gameID: requestedID,
        WhiteName = "White",
        BlackName = "Black",
        boardID,
      } = req.body;

      // Auto-generate gameID if not supplied by caller
      const gameID = requestedID || `game_${Date.now().toString(36)}`;

      // If a physical board is attached, start with waiting_scan status
      const status = boardID ? "waiting_scan" : "active";
      await GameService.create(gameID, { WhiteName, BlackName, status });

      // Link the physical board to this game so the next heartbeat notifies ESP32.
      // Use pendingGameID instead of overwriting gameID directly — this ensures
      // the new game is delivered exactly once without interrupting an ongoing game.
      if (boardID) {
        const board = getBoardRegistry().get(boardID);
        if (board) {
          board.pendingGameID = gameID;
          getIO().emit("board_heartbeat", { boardID, gameID, online: true, lastSeen: board.lastSeen });
        }
        // Queue START command — delivered on the board's next heartbeat (fast poll: ~5 s)
        setGamePendingCommand(gameID, "START");
      }

      invalidateCached("games:");
      getIO().emit("game:created", { gameID });

      res.json({ status: "Game created", gameID });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  },

  async getCurrent(req, res) {
    try {
      const cached = getCached(CURRENT_CACHE_KEY);
      if (cached) {
        withCacheHeaders(res, 2);
        return res.json(cached);
      }
      const games = await loadAllGame();
      setCached(CURRENT_CACHE_KEY, games ?? [], CURRENT_TTL_MS);
      withCacheHeaders(res, 2);
      res.json(games ?? []);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  },

  async getHistory(req, res) {
    try {
      const cached = getCached(HISTORY_CACHE_KEY);
      if (cached) {
        withCacheHeaders(res, 10);
        return res.json(cached);
      }
      const rows = await getPGNCollections()
        .find({})
        .sort({ endedAt: -1, createAt: -1 })
        .toArray();

      const games = rows.map((g) => {
        const plies = Number(g.totalPlies ?? g.totalMoves ?? 0);
        return {
          ...g,
          WhiteName: g.WhiteName ?? g.White ?? "White",
          BlackName: g.BlackName ?? g.Black ?? "Black",
          totalPlies: plies,
          totalMoves: Math.ceil(plies / 2),
          Date: g.Date ?? (g.createAt ? new Date(g.createAt).toISOString().slice(0, 10) : ""),
          source: g.source ?? (Array.isArray(g.fenHistory) && g.fenHistory.length > 0 ? "fen" : "pgn"),
        };
      });

      setCached(HISTORY_CACHE_KEY, games, HISTORY_TTL_MS);
      withCacheHeaders(res, 10);
      res.json(games);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  },

  async deleteHistory(req, res) {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid history id" });
      }
      await getPGNCollections().deleteOne({ _id: new ObjectId(id) });
      invalidateCached("games:history");
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  },
};
