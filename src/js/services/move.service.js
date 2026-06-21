import { error } from "console";
import { getCurrentGame, makeMove, restorefromDB } from "../game/game.manager.js";
import { saveGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";
import { stockfishService } from "./stockfish.instance.js";
import { BOARD_TYPE, MOVE_STATUS, MOVE_TYPE } from "../constant.js";
import { games, gameSeq } from "../game/game.repository.js";

/**Parse json
 * boardType  is HALL:
 *  
 */
function parseCandidates({ boardType, uci, moveType, departures, arrivals }) {
    // parse input
    let candidates = [];
    let fromSq = null;

    if (boardType === BOARD_TYPE.HALL) {
        // if (!uci) {
        //     return { error: true, message: "Missing UCI" };
        // } 
        if(moveType === MOVE_TYPE.MOVE_ERROR) {
            const depList = departures ? departures.split(",").map(s => s.trim()).filter(Boolean) : [];

            return {candidates: depList, isError: true};
        }
        
        return {
            candidates: [uci]
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
        return {
            candidates: [uci]
        };
    }

    return { candidates, fromSq };
}

/**
 * NFC flow
 * makeMove with those candidates
 */
async function processMoveNFC({ boardType, gameID, fen, seq, moveType, uci }) {
    // test
    const parsed = parseCandidates({ boardType, uci, moveType });
    if (!parsed) return parsed;

    const { candidates } = parsed;
    
    const state = await makeMove(gameID, candidates, seq, moveType, boardType); // handle move game

    if (state.status != MOVE_STATUS.OK) return state;
    await afterMove(gameID, state, uci, seq, boardType, fen);

    return state;
}

async function processMoveHall({ boardType, gameID, seq, moveType, uci, departures, arrivals }) {
    const parsed = parseCandidates({ boardType, uci, moveType, departures, arrivals });
    if (!parsed) return parsed;
    const { candidates, isError } = parsed;
    
    const state = await makeMove(gameID, candidates, seq, moveType, boardType); // handle move game

    if (state.status != MOVE_STATUS.OK) return state;
    const uciToSave = isError ? `dep:${departures ?? ""} arr:${arrivals ?? ""}` : uci; 

    await afterMove(gameID, state, uciToSave, seq, boardType);
    return {
        status: state.status,
        fen: state.fen,
        lastSeq: state.lastSeq,
        lastMove: state.lastMove ?? null,
        branchCount: state.branchCount,
        branches: state.branches?.map(b => ({ uci: b.uci, from: b.from, to: b.to })) ?? [],
    };
}

/**
 * Shared post-move logic: stockfish eval, DB save, socket broadcast.
 */
async function afterMove(gameID, state, uci, seq, boardType, fen ) {
    // const fen = state.fen;

    await saveGame(gameID, state, { uci, fen, seq, boardType }); // save db
    getIO().to(gameID).emit("esp_move", state);// broadcast move
}

export const MoveService = {
    async processMove({ boardType, uci, start, end, fen, boardID, seq, moveType, departures, arrivals }) {
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

        switch (boardType) {
            case BOARD_TYPE.NFC:
                return processMoveNFC({ boardType, gameID, fen, seq, moveType, uci });
            case BOARD_TYPE.HALL:
                return processMoveHall({boardType, gameID, seq, moveType, uci, departures, arrivals });
            default:
                console.error("Unknown boardType: ", boardType);
                return { error: true, message: `Unknown boardType: ${boardType}` };
        }
    },
}