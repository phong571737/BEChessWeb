import { makeMove } from "../game/game.manager.js";
import { saveGame } from "../models/game.model.js";
import { saveLog } from "../models/log.model.js";
import { getIO } from "../sockets/index.js";
import { stockfishService } from "./stockfish.instance.js";

export const MoveService = {
    async processMove({uci, start, end, gameID, seq, lift, place}) {
        // parse input
        let candidates = [];
        if (start === "MULTI" && end) {
            candidates = end.split(",");
        }else if (uci && uci.startsWith("MULTI")) {
            candidates = uci.replace("MULTI:", "").replace("MULTI", "").split(",");
        }else if (uci && uci.includes(",")) {
            candidates = uci.split(",");
        }else if (uci) {
            candidates = [uci];
        } else {
            return{ error: true, message: "Missing move data"};
        }

        await saveLog(gameID, seq, uci, lift, place);

        // handle move game
        const state = await makeMove(gameID, candidates, seq);
        if(state.status != "ok") state;
        
        const fen = state.fen;
        // send best move to frontend
        const bestmove = await stockfishService.evaluate(fen, (cp) => {
            getIO().to(gameID).emit("eval_bestmove", {gameID, cp});
        });

        console.log("Best move:", bestmove);

        // save db
        await saveGame(gameID, state); //reload

        // send to web frontend
        getIO().to(gameID).emit("esp_move", state);
        return state;
    }
}