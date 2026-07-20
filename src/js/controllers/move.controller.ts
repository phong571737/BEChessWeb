import { ERROR_STATUS } from "../constant.js";
import { MoveService } from "../services/move.service.js";
import { Request, Response } from "express";

export const MoveController = {
    async handleMove(req: Request, res: Response): Promise<void> {
        try {
            const result = await MoveService.processMove(req.body);
            console.log("result after move", result);

            res.json(result);
        } catch (err) {
            console.error("System error", err);
            res.status(500).json({
                status: ERROR_STATUS.SERVER_ERROR,
                message: "Internal server error"
            });
        }
    }
}