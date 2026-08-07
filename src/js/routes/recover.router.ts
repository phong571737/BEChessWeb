import express, { Router } from "express";
import { Chess } from "chess.js";
import { gameMutationRateLimit } from "../middleware/rate-limit.middleware.js";
import { recoverFenHistory } from "../services/fen-recovery.client.js";
import { customPGN } from "../utils/custom.chess.js";
import { inferMoveFromFen } from "../utils/chess.utils.js";

export const recoverRouter: Router = express.Router();

function sendInternalError(res: express.Response, operation: string, error: unknown): void {
    console.error(`${operation} failed:`, error);
    res.status(500).json({ error: "Internal server error" });
}

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
        );
        if (result) return res.json(result);
        if (req.body?.strict === true) {
            return res.status(503).json({ error: "FEN recovery service unavailable" });
        }

        const startFen = new Chess().fen();
        let previousFen = startFen;
        const failedPlies: number[] = [];
        const moves = fenHistory.map((fen: string, index: number) => {
            const inferred = inferMoveFromFen(previousFen, fen);
            previousFen = fen;
            if (!inferred) failedPlies.push(index + 1);
            return inferred ?? { from: "a1", to: "a1" };
        });
        let fallback: string;
        try {
            fallback = customPGN(moves, startFen, {}, fenHistory).pgn;
        } catch (error) {
            console.warn("FEN fallback renderer failed; returning unresolved PGN", error instanceof Error ? error.message : error);
            const moveText = fenHistory.map((_: string, index: number) => {
                const moveNumber = Math.floor(index / 2) + 1;
                return `${index % 2 === 0 ? `${moveNumber}.` : "..."} x`;
            }).join(" ");
            fallback = `[Event "?"]\n[Site "?"]\n[Date "????.??.??"]\n[Round "1"]\n[White "?"]\n[Black "?"]\n[Result "*"]\n\n${moveText} *`;
        }
        return res.json({
            pgn: fallback,
            fullyRecovered: failedPlies.length === 0,
            failedPlies,
            longestRecoveredPly: failedPlies.length ? Math.max(0, failedPlies[0]! - 1) : fenHistory.length,
        });
    } catch (error) {
        sendInternalError(res, "POST /games/recover", error);
    }
});
