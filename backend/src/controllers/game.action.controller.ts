import { Request, Response } from "express";
import { GameActionService } from "../services/game.action.service.js";
import { GameResignService } from "../services/game.resign.service.js";
import { GameIdParams, RenameBody, ResignBody } from "../types/game.types.js";
import { ERROR_STATUS } from "../constant.js";
import { publishBoardCommand } from "../services/mqtt.service.js";
import { getIO } from "../sockets/index.js";

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
            // Keep every viewer in the room synchronized with the server-side
            // terminal transition, including HTTP resignations.
            getIO().to(gameID).emit("update_all_game", {
                gameID,
                result: resignSide === "draw" ? "1/2-1/2" : resignSide === "white" ? "0-1" : "1-0",
            });
            res.json(result);
        } catch (e) {
            console.error("RESIGN ERROR:", e);
            const message = e instanceof Error ? e.message : String(e);
            const status = message === ERROR_STATUS.NOTFOUND || message === "Game not found" ? 404
                : message === ERROR_STATUS.RESIGN_ERROR || message === "resignSide error" ? 400
                    : message === "RESIGN_IN_PROGRESS" || message === "RESIGN_ALREADY_PROCESSED" || message === "GAME_STATE_CONFLICT" ? 409
                    : 500;
            res.status(status).json({ error: message });
        }
    },

    // restart action
    async restart(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            const gameID = req.params.id;
            const result = await GameActionService.restart(gameID);
            // Keep the physical board in sync with the web reset. The game
            // reset is already committed; MQTT availability is reported to
            // the client without turning a successful reset into a 500.
            const boardResetPublished = await publishBoardCommand(result.boardID, "restart_game");
            res.json({ ok: true, boardResetPublished, ...result });
        } catch (e) {
            console.error("Restart error:", e);
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
            if (message === "GAME_STATE_CONFLICT") {
                res.status(409).json({ error: true, message: "Game state changed. Reload and try again." });
                return;
            }
            res.status(500).json({ error: message });
        }
    },

    // destroy action
    async destroy(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            const gameID = req.params.id;
            const result = await GameActionService.destroy(gameID);
            res.json({
                result
            });
        } catch (e) {
            console.error("Destroy game error:", e);
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
            const { color, name, initialTimeMs, incrementMs, round, boardNumber, location } = req.body;

            const maxInitialTimeMs = 24 * 60 * 60 * 1_000;
            const maxIncrementMs = 60 * 60 * 1_000;
            // Check input validation for optional fields
            if (boardNumber !== undefined && (typeof boardNumber !== "string" || boardNumber.trim().length > 40)) {
                res.status(400).json({ error: "boardNumber must be a string no longer than 40 characters" });
                return;
            }
            if (initialTimeMs !== undefined && (!Number.isFinite(initialTimeMs) || initialTimeMs <= 0 || initialTimeMs > maxInitialTimeMs)) {
                res.status(400).json({ error: "initialTimeMs must be a positive number no greater than 24 hours" });
                return;
            }
            if (incrementMs !== undefined && (!Number.isFinite(incrementMs) || incrementMs < 0 || incrementMs > maxIncrementMs)) {
                res.status(400).json({ error: "incrementMs must be a number between 0 and 1 hour" });
                return;
            }
            if (round !== undefined && (!Number.isInteger(round) || round < 1 || round > 99)) {
                res.status(400).json({ error: "round must be an integer between 1 and 99" });
                return;
            }
            if (location !== undefined && (typeof location !== "string" || location.trim().length > 160)) {
                res.status(400).json({ error: "location must be a string no longer than 160 characters" });
                return;
            }

            await GameActionService.rename(gameID, color, name, initialTimeMs, incrementMs, round, location?.trim(), boardNumber?.trim(),);

            res.json({
                ok: true
            });
        } catch (e) {
            console.error("Rename failed:", e);
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
