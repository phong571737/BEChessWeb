import { getOrRestoreCurrentGame, makeMove, restorefromDB } from "../game/game.manager.js";
import { getGame, saveActiveGameHistorySnapshot, saveGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";
import { BOARD_TYPE, MOVE_STATUS, MOVE_TYPE } from "../constant.js";
import { games } from "../game/game.repository.js";
import { MoveState, ParseCandidatesInput, ParsedCandidates, ProcessMoveInput } from "../types/move.types.js";
import { getCurrentClock } from "./clock.service.js";

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
    if (!persistedGame) throw new Error("GAME_STATE_CONFLICT");
    const clock = getCurrentClock(persistedGame, now.getTime());

    const nextSide = state.fen?.split(" ")[1] === "b" ? "black" : "white";
    // The board-provided FEN is the source of truth for turn ownership.  The
    // side that just moved is the opposite of the side encoded in that FEN;
    // do not infer it from a possibly stale client clock state.
    const movedSide = nextSide === "black" ? "white" : "black";

    let whiteRemainingMs = clock.whiteRemainingMs;
    let blackRemainingMs = clock.blackRemainingMs;

    if (movedSide === "white") {
        whiteRemainingMs += persistedGame.incrementMs ?? 0;
    } else {
        blackRemainingMs += persistedGame.incrementMs ?? 0;
    }

    const startedAt = persistedGame?.startedAt ?? now;
    // The clock starts after the first accepted move. Subsequent entries are
    // measured from the previous accepted move and persisted by ply.
    const previousMoveAt = persistedGame?.lastMoveAt;
    const previousMoveTimestamp = previousMoveAt ? new Date(previousMoveAt).getTime() : Number.NaN;
    const moveDurationMs = Number.isFinite(previousMoveTimestamp)
        ? Math.max(0, now.getTime() - previousMoveTimestamp)
        : 0;
    const durationSec = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1_000));
    const write = await saveGame(
        gameID,
        {
            fen: state.fen, pgn: state.pgn, lastMove: state.lastMove,
            startedAt, lastMoveAt: now, durationSec,
            whiteRemainingMs, blackRemainingMs,
            activeClockSide: nextSide,
            // Start the newly active side's server clock at this move's commit time.
            clockStartedAt: now,
            status: "playing",
        },
        { uci, fen: state.fen, seq, boardType, moveDurationMs, expectedVersion, expectedStatus: ["waiting", "ready", "playing", "active", "idle"] }
    ); // save db
    if (!write?.modifiedCount) {
        await restorefromDB(gameID);
        throw new Error("GAME_STATE_CONFLICT");
    }

    // Use the document returned by MongoDB as the source of the history
    // snapshot. This guarantees PGN, UCI, FEN, names, location, and timing
    // metadata are identical in `games` and `game_history` after every move.
    const updatedGame = await getGame(gameID);
    if (updatedGame) await saveActiveGameHistorySnapshot(updatedGame);

    getIO().to(gameID).emit("esp_move", state);// broadcast move
    if (updatedGame) {
        // Keep the clock event tied to the exact FEN persisted by the board.
        // Consumers must derive the side to move from this FEN, never from a
        // client-side clock toggle or a locally reconstructed position.
        getIO().to(gameID).emit("clock_state", {
            gameID,
            ...getCurrentClock(updatedGame),
            fen: updatedGame.fen,
        });
    }
}

export const MoveService = {
    async processMove({ boardType, uci, fen, boardID, seq, moveType, departures, arrivals }: ProcessMoveInput) {
        const gameID = await getOrRestoreCurrentGame(boardID);

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
