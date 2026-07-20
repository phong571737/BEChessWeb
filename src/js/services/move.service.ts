import { getCurrentGame, makeMove, restorefromDB } from "../game/game.manager.js";
import { saveGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";
import { BOARD_TYPE, MOVE_STATUS, MOVE_TYPE } from "../constant.js";
import { games } from "../game/game.repository.js";
import { MoveState, ParseCandidatesInput, ParsedCandidates, ProcessMoveInput } from "../types/move.types.js";

/**Parse json
 * boardType is HALL
 */
function parseCandidates({ boardType, uci, moveType, departures, arrivals }: ParseCandidatesInput): ParsedCandidates {
    // parse input
    if (boardType === BOARD_TYPE.HALL) {
        if(moveType === MOVE_TYPE.MOVE_ERROR) {
            const depList = departures ? departures.split(",").map(s => s.trim()).filter(Boolean) : [];
            return {candidates: depList, isError: true};
        }
        
        return {
            candidates: uci ? [uci] :[],
        }
    } else if (boardType === BOARD_TYPE.NFC) {
        if(moveType === MOVE_TYPE.MOVE_ERROR) {
            const depList = departures ? departures.split(",").map(s => s.trim()).filter(Boolean) : [];
            return {candidates: depList, isError: true};
        }

        if (!uci) {
            return {
                error: true,
                message: "Missing UCI",
            }
        }
        return {
            candidates: [uci]
        };
    }

    return { candidates: []};
}

/**
 * NFC flow
 * makeMove with those candidates
 */
async function processMoveNFC({ boardType, gameID, fen, seq, moveType, uci, departures, arrivals }: {
    boardType: string, gameID: string, fen?: string, seq: number, moveType: string, uci?: string, 
    departures?: string, arrivals?: string
}): Promise<MoveState | ParsedCandidates> {
    const parsed = parseCandidates({ boardType, uci, moveType, departures, arrivals });
    if (parsed.error) return parsed;

    const { candidates } = parsed;
    
    const state = await makeMove(gameID, candidates, seq, moveType, boardType, fen); // handle move game

    if (state.status != MOVE_STATUS.OK) return state;
    await afterMove(gameID, state, uci, seq, boardType, fen);

    return state;
}

async function processMoveHall({ boardType, gameID, seq, moveType, uci, departures, arrivals }: {
    boardType: string, gameID: string, seq: number, moveType: string, uci?: string, departures?: string, arrivals?: string
}) {
    const parsed = parseCandidates({ boardType, uci, moveType, departures, arrivals });
    if (parsed.error) return parsed;
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
async function afterMove(
    gameID: string, state: MoveState, uci: string | undefined, seq: number, boardType: string, fen?: string 
): Promise<void> {
    await saveGame(
        gameID, 
        { fen: state.fen, pgn: state.pgn, lastMove: state.lastMove}, 
        { uci, fen, seq, boardType }
    ); // save db
    const roomSize = getIO().sockets.adapter.rooms.get(gameID)?.size ?? 0;
    console.log(`[SOCKET DEBUG] Room ${gameID} has ${roomSize} client(s)`);

    getIO().to(gameID).emit("esp_move", state);// broadcast move
}

export const MoveService = {
    async processMove({ boardType, uci, fen, boardID, seq, moveType, departures, arrivals }: ProcessMoveInput) {
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
                return processMoveNFC({ boardType, gameID, fen, seq, moveType, uci, departures, arrivals });
            case BOARD_TYPE.HALL:
                return processMoveHall({boardType, gameID, seq, moveType, uci, departures, arrivals });
            default:
                console.error("Unknown boardType: ", boardType);
                return { error: true, message: `Unknown boardType: ${boardType}` };
        }
    },
}