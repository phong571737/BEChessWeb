import { ERROR_STATUS } from "../constant.js";
import { MoveService } from "../services/move.service.js";
import { Request, Response } from "express";

export const MoveController = {
    async handleMove(req: Request, res: Response): Promise<void> {
        try {
            const result = await MoveService.processMove(req.body);
            res.json(result);
        } catch (err) {
            console.error("System error", err);
            if (err instanceof Error && err.message === "GAME_STATE_CONFLICT") {
                res.status(409).json({ status: "GAME_STATE_CONFLICT", message: "Game state changed. Reload and try again." });
                return;
            }
            res.status(500).json({
                status: ERROR_STATUS.SERVER_ERROR,
                message: "Internal server error"
            });
        }
    }
}
