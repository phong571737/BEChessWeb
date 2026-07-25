import { Request, Response } from "express";
import { GameActionService } from "../services/game.action.service.js";
import { GameResignService } from "../services/game.resign.service.js";
import { GameIdParams, RenameBody, ResignBody } from "../types/game.types.js";
import { ERROR_STATUS } from "../constant.js";

export const GameActionController = {
    // resign action
    async resign(
        req: Request<GameIdParams, unknown, ResignBody>,
        res: Response
    ): Promise<void> {
        try {
            const gameID = req.params.id;
            const { resignSide, boardType, branchId } = req.body;
            const result = await GameResignService.handle(gameID, resignSide, boardType, branchId);
            res.json(result);
        } catch (e) {
            console.error("RESIGN ERROR:", e);
            const message = e instanceof Error ? e.message : String(e);
            const status = message === "Game not found" ? 404
                : message === "resignSide error" ? 400
                    : 500;
            res.status(status).json({ error: message });
        }
    },

    // restart action
    async restart(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            const gameID = req.params.id;
            console.log("Restart game:", gameID);
            await GameActionService.restart(gameID);
            res.json({ ok: true });
        } catch (e) {
            console.log("Restart error: ", e);
            const message = e instanceof Error ? e.message : String(e);
            if (message === ERROR_STATUS.NOTFOUND) {
                res.status(404).json({ error: true, message: "Game not found" });
                return;
            }
            if (message.includes("missing boardID")) {
                res.status(409).json({
                    error: true,
                    message: "Game data is corrupted (missing boardID), cannot restart. Please contact admin.",
                });
                return;
            }
            res.status(500).json({ error: message });
        }
    },

    // destroy action
    async destroy(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            const gameID = req.params.id;
            console.log("Destroy request: ", gameID);
            const result = await GameActionService.destroy(gameID);
            res.json({
                result
            });
        } catch (e) {
            console.log("Remove game", e);
            const message = e instanceof Error ? e.message : String(e);
            res.status(500).json({ error: message });
        }
    },

    async rename(
        req: Request<GameIdParams, unknown, RenameBody>,
        res: Response
    ): Promise<void> {
        try {
            const gameID = req.params.id;
            const { color, name, initialTimeMs, incrementMs } = req.body;

            const maxInitialTimeMs = 24 * 60 * 60 * 1_000;
            const maxIncrementMs = 60 * 60 * 1_000;
            if (initialTimeMs !== undefined && (!Number.isFinite(initialTimeMs) || initialTimeMs <= 0 || initialTimeMs > maxInitialTimeMs)) {
                res.status(400).json({ error: "initialTimeMs must be a positive number no greater than 24 hours" });
                return;
            }
            if (incrementMs !== undefined && (!Number.isFinite(incrementMs) || incrementMs < 0 || incrementMs > maxIncrementMs)) {
                res.status(400).json({ error: "incrementMs must be a number between 0 and 1 hour" });
                return;
            }

            await GameActionService.rename(gameID, color, name, initialTimeMs, incrementMs);

            res.json({
                ok: true
            });
        } catch (e) {
            console.log("Rename failed", e);
            const message = e instanceof Error ? e.message : String(e);
            res.status(500).json({ error: message });
        }
    },

    // reset action
    async reset(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            const gameID = req.params.id;

            await GameActionService.reset(gameID);
            res.json({ success: true });
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            res.status(500).json({ error: message });
        }
    }
}
