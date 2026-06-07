import { error } from "console";
import { getCurrentGame, makeMove, restorefromDB } from "../game/game.manager.js";
import { saveGame } from "../models/game.model.js";
import { saveLog } from "../models/log.model.js";
import { getIO } from "../sockets/index.js";
import { stockfishService } from "./stockfish.instance.js";
import { BOARD_TYPE, MOVE_STATUS, MOVE_TYPE } from "../constant.js";
import { games, gameSeq } from "../game/game.repository.js";

function parseCandidates({ boardType, uci, start, end, moveType }) {
    // parse input
    let candidates = [];
    let fromSq = null;

    if (boardType === BOARD_TYPE.HALL) {
        // a move without knowing the destination
        if (moveType === MOVE_TYPE.CAPTURE || start === "MULTI" ||
            uci?.startsWith("MULTI") || uci?.includes(",")) {
            if (start === "MULTI") {
                fromSq = end?.split(",")?.[0]?.slice(0, 2);
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
    } else if (boardType === BOARD_TYPE.NFC) {
        if (!uci) {
            return {
                error: true,
                message: "Missing UCI",
            }
        }
        if (moveType === MOVE_TYPE.PROMOTE) {
            return {
                candidates: [`${uci}q`, `${uci}r`, `${uci}b`, `${uci}n`]
            }
        }
        if (uci.endsWith('x') || moveType === MOVE_TYPE.CAPTURE) {
            const fromSq = uci.replace('x', '').slice(0, 2);
            if (!fromSq) return { error: true, message: "Missing fromSq" };
            return { candidates: [fromSq + 'x'] };  // giữ format "d4x" để findValidMove xử lý
        }
        // normal, capture, enpassant
        return {
            candidates: [uci]
        };
    }

    return { candidates, fromSq };
}

/**
 * NFC flow:
 * makeMove with those candidates
 */
async function processMoveNFC({ boardType, gameID, fen, seq, moveType, uci }) {
    // test
    const parsed = parseCandidates({ boardType, uci, moveType });
    if (!parsed) return parsed;

    const { candidates } = parsed;
    // handle move game
    const state = await makeMove(gameID, candidates, seq, moveType);

    if (state.status != MOVE_STATUS.OK) return state;
    await afterMove(gameID, state, uci, seq, fen);

    return state;
}

async function processMoveHall({ boardType, gameID, seq, moveType, uci, start, end, lift, place }) {
    const parsed = parseCandidates({ boardType, uci, start, end, moveType });
    if (!parsed) return parsed;
    const { candidates } = parsed;
    // handle move game
    const state = await makeMove(gameID, candidates, seq, moveType);

    if (state.status != MOVE_STATUS.OK) return state;

    await afterMove(gameID, state, uci, seq);
    return state;
}

/**
 * Shared post-move logic: stockfish eval, DB save, socket broadcast.
 */
async function afterMove(gameID, state, uci, seq, fen) {
    // const fen = state.fen;
    // send best move to frontend
    // const bestmove = await stockfishService.evaluate(fen, (cp) => {
    //     getIO().to(gameID).emit("eval_bestmove", { gameID, cp });
    // });

    // console.log("[Move] Best move:", bestmove);

    await saveGame(gameID, state, { uci, fen, seq }); // save db
    getIO().to(gameID).emit("esp_move", state);// broadcast move
}

export const MoveService = {
    async processMove({ boardType, uci, start, end, fen, boardID, seq, lift, place, moveType }) {
        const gameID = getCurrentGame(boardID);
        console.log(`boardID: ${boardID} and gameID: ${gameID} and boardType: ${boardType}`);

        if (!gameID) {
            return {
                error: true,
                message: "No active game for this board",
            }
        }

        // Ensure game is loaded into memory
        if (!games.has(gameID)) {
            const restored = await restorefromDB(gameID);
            if (!restored) {
                return {
                    error: true,
                    message: "Failed to restore game from DB",
                }
            }
        }

        // save log to debug
        const save_log = await saveLog(gameID, seq, uci, lift, place);
        console.log("savelog result", save_log);

        switch (boardType) {
            case BOARD_TYPE.NFC:
                return processMoveNFC({ boardType, gameID, fen, seq, moveType, uci });
            case BOARD_TYPE.HALL:
                return processMoveHall({ gameID, seq, moveType, uci, start, end, lift, place });
            default:
                console.error("Unknown boardType: ", boardType);
                return { error: true, message: `Unknown boardType: ${boardType}` };
        }
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