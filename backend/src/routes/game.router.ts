import express, { Router } from "express";
import { restorefromDB } from "../game/game.manager.js";
import { endGame, finishGame, getGame, getHistoryRecord, saveGame, updateHistoryResult } from "../models/game.model.js";
import { Chess } from "chess.js";
import { GameActionController } from "../controllers/game.action.controller.js";
import { GameController } from "../controllers/game.controller.js";
import { gameSeq } from "../game/game.repository.js";
import { requireAdmin, requireAuthenticated } from "../middleware/auth.middleware.js";
import { gameDestructiveRateLimit, gameInitCheckRateLimit, gameMutationRateLimit, gameReadRateLimit } from "../middleware/rate-limit.middleware.js";
import { GameIdParams, RenameBody } from "../types/game.types.js";
import { evaluatePosition } from "../services/stockfish.service.js";

export const gameRouter: Router = express.Router();

function sendInternalError(res: express.Response, operation: string, error: unknown): void {
    console.error(`${operation} failed:`, error);
    res.status(500).json({ error: "Internal server error" });
}

/**
 * POST /games/current
 * This api used to get current game(F5)
 */
gameRouter.get("/current", gameReadRateLimit, GameController.getCurrent);

/**
 * GET /games/history 
 * This api is used to get game played
*/
gameRouter.get("/history", gameReadRateLimit, GameController.getHistory);

gameRouter.post("/history/:id/analysis", gameMutationRateLimit, requireAuthenticated, GameController.saveHistoryAnalysis);

/** Administrator-only correction of one persisted FEN snapshot. */
gameRouter.post("/history/:id/fens", gameMutationRateLimit, requireAdmin, GameController.appendHistoryFen);
gameRouter.put("/history/:id/fens/:index", gameMutationRateLimit, requireAdmin, GameController.updateHistoryFen);
gameRouter.delete("/history/:id/fens/:index", gameDestructiveRateLimit, requireAdmin, GameController.deleteHistoryFen);

/** Administrator-only recycle bin for recoverable history deletion. */
gameRouter.get("/history/trash", gameReadRateLimit, requireAdmin, GameController.getHistoryTrash);
gameRouter.delete("/history/trash/permanent", gameDestructiveRateLimit, requireAdmin, GameController.permanentlyDeleteAllHistory);
gameRouter.post("/history/:id/restore", gameMutationRateLimit, requireAdmin, GameController.restoreHistory);
gameRouter.delete("/history/:id/permanent", gameDestructiveRateLimit, requireAdmin, GameController.permanentlyDeleteHistory);

/**
 * DELETE /games/history/:id 
 * This api is used to delete game played
*/
gameRouter.delete("/history/:id", gameDestructiveRateLimit, requireAdmin, GameController.deleteHistory);

/** Administrator-only correction for a history record that has no confirmed result. */
gameRouter.put("/history/:id/result", gameMutationRateLimit, requireAdmin, async (req, res) => {
    try {
        const result = req.body?.result;
        if (result !== "1-0" && result !== "0-1" && result !== "1/2-1/2") {
            return res.status(400).json({ error: "Result must be 1-0, 0-1, or 1/2-1/2" });
        }
        const updated = await updateHistoryResult(String(req.params.id ?? ""), result);
        if (!updated) return res.status(404).json({ error: "History record not found" });
        return res.json({ success: true, result });
    } catch (e) {
        sendInternalError(res, "PUT /games/history/:id/result", e);
    }
});

/** Suggests a result from the final persisted position; an admin must confirm it. */
gameRouter.get("/history/:id/result-suggestion", gameMutationRateLimit, requireAdmin, async (req, res) => {
    try {
        const record = await getHistoryRecord(String(req.params.id ?? ""));
        if (!record) return res.status(404).json({ error: "History record not found" });
        let fen = Array.isArray(record.fenHistory) ? record.fenHistory.at(-1) : undefined;
        if (typeof fen !== "string" || !fen.trim()) {
            try {
                const chess = new Chess();
                if (typeof record.pgn === "string" && record.pgn.trim()) {
                    chess.loadPgn(record.pgn);
                    fen = chess.fen();
                }
            } catch { /* Return a clear unavailable suggestion below. */ }
        }
        if (!fen) return res.status(400).json({ error: "No final position available for analysis" });
        const evaluation = await evaluatePosition(fen);
        if (!evaluation) return res.status(503).json({ error: "Stockfish evaluation unavailable" });
        const result = evaluation.mate !== null
            ? evaluation.mate > 0 ? "1-0" : "0-1"
            : evaluation.cp !== null && evaluation.cp >= 150 ? "1-0"
                : evaluation.cp !== null && evaluation.cp <= -150 ? "0-1"
                    : null;
        return res.json({ result, cp: evaluation.cp, mate: evaluation.mate, depth: evaluation.depth, fen });
    } catch (e) {
        sendInternalError(res, "GET /games/history/:id/result-suggestion", e);
    }
});

/**
 * GET games/:id
 * This api is used to get single game by id
 */
gameRouter.get("/:id", gameReadRateLimit, async (req, res) => {
    try {
        const id = String(req.params.id ?? "");
        const game = await getGame(id);
        if (!game) {
            return res.status(404).json({ error: "Game not found" });
        }

        res.json(game);
    } catch (e) {
        sendInternalError(res, "GET /games/:id", e);
    }
});

/**
 * POST games/:id/pgn
 * This api is used to post edit pgn to server
 */
gameRouter.post("/:id/pgn", gameMutationRateLimit, requireAdmin, async (req, res) => {
    try {
        const { pgn, fen, lastMove } = req.body;
        const gameID = String(req.params.id ?? "");

        //update lastSeq
        const chess = new Chess();
        chess.loadPgn(pgn);
        const lastSeq = chess.history().length;

        await saveGame(gameID, { pgn, fen, lastMove, gameID, lastSeq });

        // Restore to update state after edit
        await restorefromDB(gameID);
        gameSeq.set(gameID, lastSeq);
        res.json({ ok: true });
    } catch (e) {
        sendInternalError(res, "POST /games/:id/pgn", e);
    }
});

/**
 * POST games/:id/restart
 * This api is used to post restart game
 */
gameRouter.post("/:id/restart", gameMutationRateLimit, requireAuthenticated, GameActionController.restart);

/**
 * POST games/:id/destroy
 * This api is used to post destroy game
 */
gameRouter.post("/:id/destroy", gameDestructiveRateLimit, requireAdmin, GameActionController.destroy);

/**
 * POST games/:id/resign
 * This api is used to post Resign game
 * Body: {resignSide}
 * Response 200: { status: OK, oldGameID, newGameID, loser, winner }
 * Response 400, 404, 500: { error};
 */
gameRouter.post("/:id/resign", gameMutationRateLimit, requireAuthenticated, GameActionController.resign);

/**
 * POST games/:id/reset
 * This api is used to post reset board when the game end 
 */
gameRouter.post("/:id/reset", gameMutationRateLimit, requireAdmin, GameActionController.reset);

/**
 * POST games/:id/rename
 * This api is used to post rename player
 */
gameRouter.post<GameIdParams, unknown, RenameBody>("/:id/rename", gameMutationRateLimit, requireAuthenticated, GameActionController.rename);

/**
 * POST games/:id/endgame
 * This api is used to post endgame 
 */
gameRouter.post("/:id/endgame", gameMutationRateLimit, requireAdmin, async (req, res) => {
    try {
        const gameID = String(req.params.id ?? "");
        const { pgn } = req.body;

        if (!pgn) {
            return res.status(400).json({ error: "PGN required" });
        }
        const chess = new Chess();
        chess.loadPgn(pgn);
        const header = chess.getHeaders();
        const currentGame = await getGame(gameID);
        const endedAt = new Date();
        const startedAt = currentGame?.startedAt ?? currentGame?.createdAt ?? endedAt;
        const durationSec = currentGame?.startedAt
            ? Math.max(0, Math.floor((endedAt.getTime() - new Date(currentGame.startedAt).getTime()) / 1_000))
            : currentGame?.durationSec ?? 0;

        const doc = {
            gameID,
            pgn,
            Result: header.Result || "*",
            White: header.White || "White",
            Black: header.Black || "Black",
            Date: header.Date || "",
            totalMoves: chess.history().length,
            createdAt: startedAt,
            startedAt,
            endedAt,
            durationSec,
        }

        await endGame(doc);

        res.json(doc);
    } catch (e) {
        sendInternalError(res, "POST /games/:id/endgame", e);
    }
});

/**
 * GET games/:id/initcheck
 * This api is used to get state of physic board
 * Response 200: 
 * { gameID: string,
 *   status: BOARD_STATUS,
 *   missingSquares: string[],
 *   extraSquares: string[],
 *   wrongPieceSquares: string[]
 * }
 * Error Response:
 * Status: 500
 * {
 *   status: ERROR_STATUS.SERVER_ERROR,
 *   error: string
 * }
 */
gameRouter.get("/:id/initcheck", gameInitCheckRateLimit, GameController.initcheck);

/**PUT  games/:id/update
 * This api is used to update data
 */
gameRouter.put("/:id/update", gameMutationRateLimit, requireAdmin, async (req, res) => {
    try {
        const id = String(req.params.id ?? "");
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
        res.json(game);

    } catch (e) {
        sendInternalError(res, "PUT /games/:id/update", e);
    }
});
