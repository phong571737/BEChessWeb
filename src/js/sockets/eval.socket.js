import { stockfishService } from "../services/stockfish.instance.js";

export function EvalSocket(io) {
    io.on("connection", (socket) => {
        socket.on("request_eval", async ({gameID, fen}) => {
            try {
                if (!fen) return;

                await stockfishService.evaluate( fen,(cp) => {
                        io.emit("eval_realtime", {
                            gameID,
                            cp
                        }); // stream
                    }
                ).then ((result) => {
                    io.emit("eval_bestmove", {gameID, cp: result.cp});
                })
            } catch (err) {
                console.error("Eval error: ", err);
            }
        })
    });
}