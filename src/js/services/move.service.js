import { error } from "console";
import { games, gameSeq, makeMove, restorefromDB } from "../game/game.manager.js";
import { saveGame } from "../models/game.model.js";
import { saveLog } from "../models/log.model.js";
import { getIO } from "../sockets/index.js";
import { stockfishService } from "./stockfish.instance.js";
import { ILLEGAL_MOVE, STATUS_OK } from "../constant.js";

export const MoveService = {
    async processMove({ uci, start, end, gameID, seq, lift, place }) {
        // parse input
        let candidates = [];

        // a move without knowing the destination
        if (uci && uci.endsWith("x") && !uci.startsWith("MULTI")) {
            candidates = await this.parseCaptureMove(uci, gameID);
            if (candidates.length === 0) {
                const lastSeq = gameSeq.get(gameID) ?? 0;
                return { 
                    status: ILLEGAL_MOVE,
                    lastSeq,
                };
            }

            console.log(`Capture ${uci} create candidates:`, candidates);
        }
        else if (start === "MULTI" && end) {
            candidates = end.split(",");
        } else if (uci && uci.startsWith("MULTI")) {
            candidates = uci.replace("MULTI:", "").replace("MULTI", "").split(",");
        } else if (uci && uci.includes(",")) {
            candidates = uci.split(",");
        } else if (uci) {
            candidates = [uci];
        } else {
            return { error: true, message: "Missing move data" };
        }

        const save_log = await saveLog(gameID, seq, uci, lift, place);
        console.log("savelog result", save_log);

        // handle move game
        const state = await makeMove(gameID, candidates, seq);
        if (state.status != STATUS_OK) return state;

        const fen = state.fen;
        // send best move to frontend
        const bestmove = await stockfishService.evaluate(fen, (cp) => {
            getIO().to(gameID).emit("eval_bestmove", { gameID, cp });
        });

        console.log("Best move:", bestmove);

        // save db
        await saveGame(gameID, state); //reload

        // send to web frontend
        getIO().to(gameID).emit("esp_move", state);
        return state;
    },

    // Handle capture for don't known destination
    async parseCaptureMove(uci, gameID) {
        const from = uci.replace("x", "");

        if (!games.has(gameID)) {
            const restored = await restorefromDB(gameID);
            if (!restored) return [];
        }
        // get all valid moves from this square
        const chess = games.get(gameID);
        console.log("parseCaptureMove FEN:", chess.fen());
        console.log("parseCaptureMove turn:", chess.turn());
        console.log("parseCaptureMove from:", from);
        console.log("piece at from:", chess.get(from));
        const moves = chess.moves({ square: from, verbose: true });
        console.log("all moves from", from, ":", moves);

        // get eat piece
        const capture = moves.filter(m => m.flags.includes('c') || m.flags.includes('e'));
        console.log("captures:", capture);

        return capture.map(m => m.from + m.to);
    }
}