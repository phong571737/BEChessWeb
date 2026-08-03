import { getCurrentGame, makeMove, restorefromDB } from "../game/game.manager.js";
import { getGame, saveGame, saveHistorySnapshot } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";
import { BOARD_TYPE, MOVE_STATUS, MOVE_TYPE } from "../constant.js";
import { games } from "../game/game.repository.js";
import { MoveState, ParseCandidatesInput, ParsedCandidates, ProcessMoveInput } from "../types/move.types.js";

/**Parse json
 * boardType is HALL
 */
function parseCandidates({ boardType, uci, moveType, departures, arrivals }: ParseCandidatesInput): ParsedCandidates {
    const normalizedBoardType = boardType?.toUpperCase();
    const isMoveError = moveType === MOVE_TYPE.MOVE_ERROR;

    // parse input
    if (normalizedBoardType === BOARD_TYPE.HALL) {
        if (isMoveError) {
            const depList = departures ? departures.split(",").map(s => s.trim()).filter(Boolean) : [];
            return { candidates: depList.length > 0 ? depList : [uci || "MOVE_ERROR"], isError: true };
        }
        
        return {
            candidates: uci ? [uci] : [],
        }
    } else if (normalizedBoardType === BOARD_TYPE.NFC) {
        if (isMoveError) {
            const depList = departures ? departures.split(",").map(s => s.trim()).filter(Boolean) : [];
            return { candidates: depList.length > 0 ? depList : [uci || "MOVE_ERROR"], isError: true };
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

    return { candidates: [] };
}

/**
 * NFC flow
 * makeMove with those candidates
 */
async function processMoveNFC({ boardType, gameID, fen, seq, moveType, uci, departures, arrivals }: {
    boardType: string, gameID: string, fen?: string, seq?: number, moveType?: string, uci?: string, 
    departures?: string, arrivals?: string
}): Promise<MoveState | ParsedCandidates> {
    const parsed = parseCandidates({ boardType, uci, moveType, departures, arrivals });
    if (parsed.error) return parsed;

    const { candidates } = parsed;
    
    const state = await makeMove(gameID, candidates, seq, moveType ?? "", boardType, fen); // handle move game

    if (state.status != MOVE_STATUS.OK) return state;
    return state;
}

async function processMoveHall({ boardType, gameID, seq, moveType, uci, departures, arrivals }: {
    boardType: string, gameID: string, seq?: number, moveType?: string, uci?: string, departures?: string, arrivals?: string
}) {
    const parsed = parseCandidates({ boardType, uci, moveType, departures, arrivals });
    if (parsed.error) return parsed;
    const { candidates, isError } = parsed;
    
    const state = await makeMove(gameID, candidates, seq, moveType ?? "", boardType); // handle move game

    if (state.status != MOVE_STATUS.OK) return state;
    const uciToSave = isError ? `dep:${departures ?? ""} arr:${arrivals ?? ""}` : uci; 

    return {
        status: state.status,
        fen: state.fen,
        lastSeq: state.lastSeq,
        lastMove: state.lastMove ?? null,
        branchCount: state.branchCount,
        // branches: state.branches?.map(b => ({ uci: b.uci, from: b.from, to: b.to })) ?? [],
    };
}

/**
 * Shared post-move logic: stockfish eval, DB save, socket broadcast.
 */
async function afterMove(
    gameID: string, state: MoveState, uci: string | undefined, seq: number, boardType: string, fen: string | undefined, expectedVersion: number
): Promise<void> {
    const now = new Date();
    const persistedGame = await getGame(gameID);
    const startedAt = persistedGame?.startedAt ?? now;
    const durationSec = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1_000));
    const write = await saveGame(
        gameID, 
        { fen: state.fen, pgn: state.pgn, lastMove: state.lastMove, startedAt, lastMoveAt: now, durationSec },
        { uci, fen: state.fen, seq, boardType, expectedVersion, expectedStatus: ["waiting", "ready", "playing", "active", "idle"] }
    ); // save db
    if (!write?.modifiedCount) {
        await restorefromDB(gameID);
        throw new Error("GAME_STATE_CONFLICT");
    }

    // Use the document returned by MongoDB as the source of the history
    // snapshot. This guarantees PGN, UCI, and FEN histories are identical in
    // `games` and `game_history` after every accepted move.
    const updatedGame = await getGame(gameID);
    await saveHistorySnapshot({
        gameID,
        boardID: updatedGame?.boardID ?? persistedGame?.boardID,
        location: updatedGame?.location ?? persistedGame?.location,
        pgn: updatedGame?.pgn ?? state.pgn ?? "",
        fen: updatedGame?.fen ?? state.fen,
        initialFen: updatedGame?.initialFen ?? persistedGame?.initialFen,
        lastMove: updatedGame?.lastMove ?? state.lastMove ?? null,
        lastSeq: updatedGame?.lastSeq ?? state.lastSeq ?? seq,
        totalMoves: updatedGame?.lastSeq ?? state.lastSeq ?? seq,
        totalPlies: updatedGame?.lastSeq ?? state.lastSeq ?? seq,
        uciHistory: updatedGame?.uciHistory ?? [],
        fenHistory: updatedGame?.fenHistory ?? [],
        WhiteName: updatedGame?.WhiteName ?? persistedGame?.WhiteName ?? "White",
        BlackName: updatedGame?.BlackName ?? persistedGame?.BlackName ?? "Black",
        Result: "*",
        Date: now.toISOString().slice(0, 10).replace(/-/g, "."),
        round: persistedGame?.round ?? 1,
        startedAt: updatedGame?.startedAt ?? startedAt,
        lastMoveAt: now,
        durationSec: updatedGame?.durationSec ?? durationSec,
    });

    getIO().to(gameID).emit("esp_move", state);// broadcast move
}

export const MoveService = {
    async processMove({ boardType, uci, fen, boardID, seq, moveType, departures, arrivals }: ProcessMoveInput) {
        const gameID = getCurrentGame(boardID);

        if (!gameID) {
            return {
                error: true,
                message: "No active game for this board",
            }
        }

        const persistedGame = await getGame(gameID);
        if (!persistedGame || ["finished", "resigning"].includes(persistedGame.status ?? "")) {
            return { error: true, message: "GAME_STATE_CONFLICT" };
        }
        const expectedVersion = persistedGame.version ?? 0;

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
            case BOARD_TYPE.NFC: {
                const moveState = await processMoveNFC({ boardType, gameID, fen, seq, moveType, uci, departures, arrivals }) as MoveState;
                if (moveState.status === MOVE_STATUS.OK) await afterMove(gameID, moveState, uci, moveState.lastSeq ?? seq ?? 0, boardType, moveState.fen, expectedVersion);
                return moveState;
            }
            case BOARD_TYPE.HALL: {
                const moveState = await processMoveHall({boardType, gameID, seq, moveType, uci, departures, arrivals }) as MoveState;
                if (moveState.status === MOVE_STATUS.OK) {
                    const persistedUci = moveState.isError ? `dep:${departures ?? ""} arr:${arrivals ?? ""}` : uci;
                    await afterMove(gameID, moveState, persistedUci, moveState.lastSeq ?? seq ?? 0, boardType, moveState.fen, expectedVersion);
                }
                return moveState;
            }
            default:
                console.error("Unknown boardType: ", boardType);
                return { error: true, message: `Unknown boardType: ${boardType}` };
        }
    },
}
