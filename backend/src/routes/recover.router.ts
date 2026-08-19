import express, { Router } from "express";
import { ObjectId } from "mongodb";
import { gameMutationRateLimit, gameReadRateLimit } from "../middleware/rate-limit.middleware.js";
import { FenRecoveryServiceError, recoverFenHistory } from "../services/fen-recovery.client.js";
import { getGame, getPGNCollections } from "../models/game.model.js";

export const recoverRouter: Router = express.Router();

function sendInternalError(res: express.Response, operation: string, error: unknown): void {
    console.error(`${operation} failed:`, error);
    res.status(500).json({ error: "Internal server error" });
}

/** GET /games/history/:id/recovered-pgn - rebuild review notation via the sidecar. */
recoverRouter.get("/history/:id/recovered-pgn", gameReadRateLimit, async (req, res) => {
    try {
        const id = String(req.params.id ?? "");
        const historyIds: unknown[] = [id];
        if (ObjectId.isValid(id)) historyIds.push(new ObjectId(id));
        const game = await getPGNCollections().findOne({ $or: historyIds.map((_id) => ({ _id })) } as any);
        if (!game) return res.status(404).json({ error: "Game not found" });

        const fenHistory = Array.isArray((game as any).fenHistory)
            ? (game as any).fenHistory.filter((fen: unknown): fen is string => typeof fen === "string" && fen.trim().length > 0)
            : [];
        if (!fenHistory.length) return res.status(422).json({ error: "No FEN history available for recovery" });

        const startFen = typeof (game as any).initialFen === "string" && (game as any).initialFen.trim()
            ? (game as any).initialFen.trim()
            : undefined;
        const headers = {
            Event: String((game as any).Event ?? "?"),
            Site: String((game as any).location ?? (game as any).Site ?? "?"),
            Date: String((game as any).Date ?? "????.??.??"),
            Round: String((game as any).round ?? (game as any).Round ?? "1"),
            White: String((game as any).whiteName ?? (game as any).WhiteName ?? (game as any).White ?? "White"),
            Black: String((game as any).blackName ?? (game as any).BlackName ?? (game as any).Black ?? "Black"),
            Result: String((game as any).result ?? (game as any).Result ?? "*"),
        };
        const debugRecovery = req.query.debugRecovery === "1";
        if (debugRecovery) {
            console.log("[FEN RECOVERY 1 - fenHistory backend lấy từ MongoDB]", {
                gameId: id,
                count: fenHistory.length,
                startFen: startFen ?? null,
                fenHistory,
            });
        }
        const recovered = await recoverFenHistory(fenHistory, startFen, headers, {
            includeSteps: true,
            debug: debugRecovery,
            exposeServiceErrors: true,
        });
        if (!recovered) return res.status(503).json({ error: "FEN recovery service unavailable" });
        return res.json({ ...recovered, fenHistory, startFen: startFen ?? null });
    } catch (error) {
        if (error instanceof FenRecoveryServiceError) {
            return res.status(error.httpStatus).json({ error: error.message, code: error.code });
        }
        sendInternalError(res, "GET /games/history/:id/recovered-pgn", error);
    }
});

/** GET /games/history/:id/fen-text - download the recovery-service timeline format. */
recoverRouter.get("/history/:id/fen-text", gameReadRateLimit, async (req, res) => {
    try {
        const id = String(req.params.id ?? "");
        const liveGame = await getGame(id);
        const historyIds: unknown[] = [id];
        if (ObjectId.isValid(id)) historyIds.push(new ObjectId(id));
        const historyGame = await getPGNCollections().findOne({ $or: historyIds.map((_id) => ({ _id })) } as any);
        const game = liveGame ?? historyGame;
        if (!game) return res.status(404).json({ error: "Game not found" });
        const startFen = typeof (game as any).initialFen === "string" && (game as any).initialFen.trim()
            ? (game as any).initialFen.trim()
            : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        const fens = Array.isArray((game as any).fenHistory)
            ? (game as any).fenHistory.filter((fen: unknown): fen is string => typeof fen === "string" && fen.trim().length > 0)
            : [];
        const gameLabel = String((game as any).gameID ?? id);
        const content = [
            `# id: ${gameLabel}`,
            `# start_fen: ${startFen}`,
            "",
            ...fens.map((fen: string, index: number) => `${index + 1}. ${fen}`),
            "",
        ].join("\n");
        const safeName = gameLabel.replace(/[^a-zA-Z0-9_-]/g, "_");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename=\"${safeName}-fen-timeline.txt\"`);
        return res.send(content);
    } catch (error) {
        sendInternalError(res, "GET /games/history/:id/fen-text", error);
    }
});

/** POST /games/recover - convert a FEN timeline into PGN. */
recoverRouter.post("/recover", gameMutationRateLimit, async (req, res) => {
    try {
        const fenHistory = Array.isArray(req.body?.fenHistory)
            ? req.body.fenHistory.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
            : [];
        if (fenHistory.length === 0 || fenHistory.length > 500) {
            return res.status(400).json({ error: "fenHistory must contain between 1 and 500 positions" });
        }
        const result = await recoverFenHistory(
            fenHistory,
            typeof req.body?.startFen === "string" ? req.body.startFen : undefined,
            typeof req.body?.headers === "object" && req.body.headers !== null ? req.body.headers : {},
            { nRetry: 5, exposeServiceErrors: true },
        );
        if (result) return res.json(result);
        return res.status(503).json({ error: "FEN recovery service unavailable" });
    } catch (error) {
        if (error instanceof FenRecoveryServiceError) {
            return res.status(error.httpStatus).json({ error: error.message, code: error.code });
        }
        sendInternalError(res, "POST /games/recover", error);
    }
});
