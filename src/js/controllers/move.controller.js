import { ERROR_STATUS, MOVE_STATUS } from "../constant.js";
import { MoveService } from "../services/move.service.js";

export const MoveController = {
    async handleMove(req, res) {
        try {
            const result = await MoveService.processMove(req.body);
            console.log("result after move", req.body);

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