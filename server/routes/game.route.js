import express from "express";
import {gameSeq, restorefromDB } from "../game/game.manager.js";
import { endGameOnce, finishGame, getPGNCollections, loadGame, saveGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";
import { Chess } from "chess.js";
import { checkInitialBoard, convertHalltoBoard } from "../services/board.service.js";
import { ObjectId } from "mongodb";
import { GameActionController } from "../controllers/game.action.controller.js";
import { GameController } from "../controllers/game.controller.js";
import { invalidateCached, withCacheHeaders } from "../utils/response.cache.js";
import { setGamePendingCommand } from "../routes/board.route.js";

export const gameRouter = express.Router();
const initState = {}; // state of physics board

/**
 * POST /games
 *This api is used to create game
 */
gameRouter.post("/", GameController.create);

/**
 * POST /games/current
 * This api used to get current game(F5)
 */
gameRouter.get("/current", GameController.getCurrent);

/**
 * GET /games/history 
 * This api is used to get game played
*/
gameRouter.get("/history", GameController.getHistory);

/**
 * DELETE /games/history/:id 
 * This api is used to delete game played
*/
gameRouter.delete("/history/:id", GameController.deleteHistory);

/**
 * GET games/:id
 * This api is used to get single game by id
 */
gameRouter.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        // No in-memory cache here: moves arrive via the physical board to whichever
        // server instance handles them (local or cloud). Caching on Render would
        // serve stale FENs when moves were written to MongoDB by the local server.
        // MongoDB single-document reads are fast enough without a cache layer.
        const game = await loadGame(id);
        if (!game) {
            return res.status(404).json({ error: "Game not found" });
        }
        withCacheHeaders(res, 0);  // no-store: bypass Vercel CDN edge cache
        res.json(game);
    } catch (e) {
        console.error("[GET /games/:id]", e);
        return res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * POST games/:id/pgn
 * This api is used to post edit pgn to server
 */
gameRouter.post("/:id/pgn", async (req, res) => {
    try {
        const { pgn, fen, lastMove } = req.body;
        const gameID = req.params.id;

        //update lastSeq
        const chess = new Chess();
        chess.loadPgn(pgn);
        const lastSeq = chess.history().length;

        await saveGame(gameID, { pgn, fen, lastMove, gameID, lastSeq });

        console.log("Before delete - gameSeq:", gameSeq.get(gameID));
        // Restore to update state after edit
        await restorefromDB(gameID);
        gameSeq.set(gameID, lastSeq);
        console.log("After delete - gameSeq:", gameSeq.get(gameID));
        invalidateCached("games:");
        invalidateCached(`games:item:${gameID}`);
        res.json({ ok: true });
    } catch (e) {
        console.error("POST /pgn error: ", e);
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST games/:id/restart
 * This api is used to post restart game
 */
gameRouter.post("/:id/restart", GameActionController.restart);

/**
 * POST games/:id/destroy
 * This api is used to post destroy game
 */
gameRouter.post("/:id/destroy", GameActionController.destroy);

/**
 * POST games/:id/resign
 * This api is used to post Resign game
 */
gameRouter.post("/:id/resign", GameActionController.resign);

/**
 * POST games/:id/reset
 * This api is used to post reset board when the game end 
 */
gameRouter.post("/:id/reset", GameActionController.reset);

/**
 * POST games/:id/rename
 * This api is used to post rename player
 */
gameRouter.post("/:id/rename", GameActionController.rename);

/**
 * POST games/:id/endgame
 * This api is used to post endgame 
 */
gameRouter.post("/:id/endgame", async (req, res) => {
    try {
        const gameID = req.params.id;
        const { pgn } = req.body;

        if (!pgn) {
            return res.status(400).json({ error: "PGN required" });
        }
        const chess = new Chess();
        chess.loadPgn(pgn);
        const now = new Date();
        const dateTag = now.toISOString().slice(0, 10).replace(/-/g, ".");

        // Load game from DB first to get stored data
        const game = await loadGame(gameID);

        const gameBaseFen = game?.fen && typeof game.fen === "string" ? game.fen : new Chess().fen();
        chess.setHeader("Event", "TTLab Chess");
        chess.setHeader("Site", process.env.PUBLIC_SITE || "TTLab Arena");
        chess.setHeader("Round", String(gameID));
        chess.setHeader("White", game?.WhiteName || chess.getHeaders().White || "White");
        chess.setHeader("Black", game?.BlackName || chess.getHeaders().Black || "Black");
        chess.setHeader("Date", dateTag);
        if (gameBaseFen !== new Chess().fen()) {
          chess.setHeader("SetUp", "1");
          chess.setHeader("FEN", gameBaseFen);
        }
        const header = chess.getHeaders();
        const normalizedPgn = chess.pgn();
        const endedAt = new Date();
        const startedAt = game?.createdAt ? new Date(game.createdAt) : null;
        const durationSec = startedAt ? Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)) : null;

        const finalFen = chess.fen();
        const doc = {
            gameID,
            pgn: normalizedPgn,
            Result: header.Result || "*",
            WhiteName: header.White || game?.WhiteName || "White",
            BlackName: header.Black || game?.BlackName || "Black",
            White: header.White || game?.WhiteName || "White",
            Black: header.Black || game?.BlackName || "Black",
            Date: header.Date || "",
            totalPlies: chess.history().length,
            totalMoves: chess.history().length,
            fenStart: "start",
            fenEnd: finalFen,
            fenHistory: Array.isArray(game?.fenHistory) ? game.fenHistory : [],
            source: "pgn",
            createAt: startedAt ?? endedAt,
            endedAt,
            durationSec,
        }

        await endGameOnce(doc);
        invalidateCached("games:");
        invalidateCached(`games:item:${gameID}`);

        res.json(doc);
    } catch (e) {
        console.error("[POST /endgame]", e);
        return res.status(500).json({ error: e.message });
    }
});

/**
 * POST games/:id/initcheck
 * This api is used to send the state init of physicboard
 * Esp32 send
 */

gameRouter.post("/:id/initcheck", async (req, res) => {
    try {
        const gameID = req.params.id;
        const {board} = req.body;
        if (!board || !Array.isArray(board)) {
            return res.status(400).json({
                status: "invalid",
                error: "Invalid board"
            });
        }

        const board2D = convertHalltoBoard(board);
        const result = checkInitialBoard(board2D);

        initState[gameID] = { result}; // save to get reuse
        getIO().to(gameID).emit("initcheck", {gameID, ...result});

        res.json({
            gameID,
            status: result.status,
        });

    } catch (e) {
        console.log("Physical board update error", e);
        res.status(500).json({ status: "invalid", error: "Server error" });
    }
});

/**
 * GET games/:id/initcheck
 * This api is used to get state of physic board
 */
gameRouter.get("/:id/initcheck", async (req, res) => {
    try {
        const gameID = req.params.id;
        const result = initState[gameID];

        if (!result) {
            return res.json({
                gameID,
                status: "waiting",
                wrongSquares: [],
                missingSquares: []
            });
        }

        res.json({ gameID, ...result });
    } catch (e) {
        console.error("[GET /initcheck]", e);
        return res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * POST games/:id/rescan
 * Re-queue the START command so ESP32 scans again.
 * Resets game status back to waiting_scan.
 */
gameRouter.post("/:id/rescan", async (req, res) => {
    try {
        const gameID = req.params.id;

        await saveGame(gameID, { status: "waiting_scan", scanMissing: [], scanReason: null });
        invalidateCached("games:");
        invalidateCached(`games:item:${gameID}`);

        // Queue START command for delivery on next heartbeat
        setGamePendingCommand(gameID, "START");

        // Notify any clients watching this game
        getIO().emit("game_status_update", { gameID, status: "waiting_scan" });

        res.json({ ok: true });
    } catch (e) {
        console.error("[POST /games/:id/rescan]", e);
        res.status(500).json({ error: e.message });
    }
});

/**PUT  games/:id/update
 * This api is used to update data
 */
gameRouter.put("/:id/update", async (req, res) => {
    try {
        const id = req.params.id;
        const { date, result, pgn } = req.body;
        if (!pgn) {
            return res.status(400).json({ error: "PGN required" });
        }

        const game = await finishGame(id, {
            date,
            result,
            pgn,
            status: "finished"
        });
        invalidateCached("games:");
        invalidateCached(`games:item:${id}`);
        res.json(game);
    } catch (e) {
        console.error("[PUT /update]", e);
        return res.status(500).json({ error: e.message });
    }
});
