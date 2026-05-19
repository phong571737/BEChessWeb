import { error } from "console";
import { makeMove, restorefromDB } from "../game/game.manager.js";
import { saveGame } from "../models/game.model.js";
import { saveLog } from "../models/log.model.js";
import { getIO } from "../sockets/index.js";
import { stockfishService } from "./stockfish.instance.js";
import { MOVE_STATUS, MOVE_TYPE } from "../constant.js";
import { games, gameSeq } from "../game/game.repository.js";

export const MoveService = {
    async processMove({ uci, start, end, gameID, seq, lift, place, moveType }) {
        // parse input
        let candidates = [];

        // a move without knowing the destination
        if (moveType === MOVE_TYPE.CAPTURE || start === "MULTI" ||
            uci?.startsWith("MULTI") || uci?.includes(",")) {
            let fromSq = null;
            if (start === "MULTI") {
                fromSq = end?.split(",")?.[0]?.slice(0,2);
            } else if (uci?.startsWith("MULTI")) {
                const parts = uci.replace("MULTI:", "").replace("MULTI", "").split(",");
                fromSq = parts[0]?.slice(0, 2);
            } else if (uci?.includes(",")) {
                fromSq = uci.split(",")?.[0]?.slice(0, 2);
            } else {
                // CAPTURE normal: "e4d5" or "e4x"
                fromSq = uci?.replace("x", "")?.slice(0, 2);
            }
            if (!fromSq) return { error: true, message: "Missing fromSq" };

            candidates = [fromSq + 'x'];
            console.log(`CAPTURE from ${fromSq}, candidates:`, candidates);

        } else if (moveType === MOVE_TYPE.PROMOTE) {
            candidates = [`${uci}q`, `${uci}r`, `${uci}b`, `${uci}n`];
        } else if (moveType === MOVE_TYPE.CASTLE) {
            candidates = [uci];
        } else if (uci) {
            candidates = [uci];
        } else {
            return { error: true, message: "Missing move data" };
        }

        // save log to debug
        const save_log = await saveLog(gameID, seq, uci, lift, place);
        console.log("savelog result", save_log);

        // handle move game
        const state = await makeMove(gameID, candidates, seq, moveType);

        if (state.status != MOVE_STATUS.OK) return state;

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