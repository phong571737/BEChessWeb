import { stockfishService } from "../services/stockfish.instance.js";

export function EvalSocket(io) {
    io.on("connection", (socket) => {
        socket.on("request_eval", async ({ gameID, fen }) => {
            if (!gameID || !fen) return;
            try {
                await stockfishService.evaluate(fen, (cp) => {
                    io.to(gameID).emit("eval_update", { gameID, cp });
                });
            } catch (err) {
                console.error("[EvalSocket] evaluation error:", err);
            }
        });
    });
}