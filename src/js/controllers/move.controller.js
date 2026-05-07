import { ILLEGAL_MOVE } from "../constant.js";
import { MoveService } from "../services/move.service.js";

export const MoveController = {
    async handleMove(req, res) {
        try {
            const result = await MoveService.processMove(req.body);
            if (result.error) {
                return res.status(400).json({
                    status: ILLEGAL_MOVE,
                    message: result.message
                });
            }

            res.json(result);
        } catch (err) {
            console.error("System error", err);
            res.status(500).json({
                status: "server_error",
                message: "Internal server error"
            });
        }
    }
}