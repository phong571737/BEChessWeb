import { getOrRestoreCurrentGame, makeMove, restorefromDB } from "../game/game.manager.js";
import { getGame, saveActiveGameHistorySnapshot, saveGame, saveLiveBoardDataWarning } from "../models/game.model.js";
import { BOARD_TYPE, MOVE_STATUS, MOVE_TYPE } from "../constant.js";
import { games } from "../game/game.repository.js";
import { MoveState, ParseCandidatesInput, ParsedCandidates, ProcessMoveInput } from "../types/move.types.js";
import type { LiveBoardDataWarning, LiveBoardDataWarningIssue } from "../types/game.types.js";
import { getCurrentClock } from "./clock.service.js";
import { emitWithSpectatorDelay, ensurePublicGameSnapshot } from "./spectator-delay.service.js";
import { Chess, validateFen } from "chess.js";
import { getIO } from "../sockets/index.js";

function boardPayloadWarning(
    gameID: string,
    { boardID, fen, uci }: Pick<ProcessMoveInput, "boardID" | "fen" | "uci">,
    previousFen?: string,
): LiveBoardDataWarning | null {
    const issues: LiveBoardDataWarningIssue[] = [];
    const normalizedFen = typeof fen === "string" ? fen.trim() : "";
    const normalizedUci = typeof uci === "string" ? uci.trim() : "";

    const fenValidation = normalizedFen ? validateFen(normalizedFen) : null;
    if (fenValidation && !fenValidation.ok) issues.push("invalid_fen");
    if (normalizedUci.toUpperCase() === "X") issues.push("uci_x");
    if (fenValidation?.ok && previousFen && /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(normalizedUci)) {
        try {
            const expected = new Chess();
            expected.load(previousFen, { skipValidation: true });
            const applied = expected.move({
                from: normalizedUci.slice(0, 2),
                to: normalizedUci.slice(2, 4),
                promotion: normalizedUci.slice(4, 5).toLowerCase() || undefined,
            });
            const expectedPlacement = expected.fen().split(" ")[0];
            const receivedPlacement = normalizedFen.split(" ")[0];
            if (applied && expectedPlacement !== receivedPlacement) issues.push("fen_uci_mismatch");
        } catch {
            // A non-standard previous position cannot be used for comparison;
            // syntax and explicit UCI=X checks still apply independently.
        }
    }
    if (!issues.length) return null;

    return {
        gameID,
        boardID,
        issues,
        ...(normalizedFen ? { fen: normalizedFen } : {}),
        ...(normalizedUci ? { uci: normalizedUci } : {}),
        receivedAt: new Date(),
    };
}

async function notifyAdminOfBoardPayload(warning: LiveBoardDataWarning): Promise<void> {
    await saveLiveBoardDataWarning(warning.gameID, warning);
    try {
        getIO().to("audience:admin").emit("board_data_warning", warning);
    } catch (error) {
        console.error("Unable to emit electronic-board data warning", error);
    }
}

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
async function processMoveNFC({ boardType, gameID, fen, moveType, uci, departures, arrivals }: {
    boardType: string, gameID: string, fen?: string, moveType?: string, uci?: string,
    departures?: string, arrivals?: string
}): Promise<MoveState | ParsedCandidates> {
    const parsed = parseCandidates({ boardType, uci, moveType, departures, arrivals });
    if (parsed.error) return parsed;

    const { candidates } = parsed;
    
    const state = await makeMove(gameID, candidates, undefined, moveType ?? "", boardType, fen); // server assigns sequence

    if (state.status != MOVE_STATUS.OK) return state;
    return state;
}

async function processMoveHall({ boardType, gameID, moveType, uci, departures, arrivals }: {
    boardType: string, gameID: string, moveType?: string, uci?: string, departures?: string, arrivals?: string
}) {
    const parsed = parseCandidates({ boardType, uci, moveType, departures, arrivals });
    if (parsed.error) return parsed;
    const { candidates, isError } = parsed;
    
    const state = await makeMove(gameID, candidates, undefined, moveType ?? "", boardType); // server assigns sequence

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
    await ensurePublicGameSnapshot(persistedGame);
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

    // Active-game cards do not join every individual game room. Broadcast the
    // authoritative move to connected clients and let each client select its
    // own gameID. This prevents an otherwise healthy Socket.IO connection
    // from silently missing moves when room membership has not completed yet.
    await emitWithSpectatorDelay("esp_move", state, { gameID, publicGame: updatedGame ?? undefined });
    if (updatedGame) {
        // Keep the clock event tied to the exact FEN persisted by the board.
        // Consumers must derive the side to move from this FEN, never from a
        // client-side clock toggle or a locally reconstructed position.
        await emitWithSpectatorDelay("clock_state", {
            gameID,
            ...getCurrentClock(updatedGame),
            fen: updatedGame.fen,
        }, { scope: "game", gameID });
    }
}

export const MoveService = {
    async processMove({ boardType, uci, fen, boardID, moveType, departures, arrivals }: ProcessMoveInput) {
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

        /* HTTP retries may arrive after the first request was committed but
         * before its response reached the board. An identical complete FEN
         * is an acknowledgement case, not a new move. Do this before
         * makeMove(), which mutates the in-memory histories. */
        const incomingFen = typeof fen === "string" ? fen.trim() : "";
        const currentFen = typeof persistedGame.fen === "string" ? persistedGame.fen.trim() : "";
        if (incomingFen && currentFen && incomingFen === currentFen) {
            return {
                status: MOVE_STATUS.DUPLICATE,
                gameID,
                fen: persistedGame.fen,
                lastSeq: persistedGame.lastSeq ?? 0,
                lastMove: persistedGame.lastMove ?? null,
            };
        }

        const expectedVersion = persistedGame.version ?? 0;
        const warning = boardPayloadWarning(gameID, { boardID, fen, uci }, persistedGame.fen);
        if (warning) await notifyAdminOfBoardPayload(warning);

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
                const moveState = await processMoveNFC({ boardType, gameID, fen, moveType, uci, departures, arrivals }) as MoveState;
                if (moveState.status === MOVE_STATUS.OK) {
                    try {
                        await afterMove(gameID, moveState, uci, moveState.lastSeq ?? 0, boardType, moveState.fen, expectedVersion);
                    } catch (error) {
                        /* Two identical requests can pass the pre-check before
                         * either one is committed. If the competing request
                         * has now persisted this exact FEN, acknowledge this
                         * request as a duplicate so the board removes it from
                         * its retry queue. */
                        if (error instanceof Error && error.message === "GAME_STATE_CONFLICT") {
                            const latestGame = await getGame(gameID);
                            const attemptedFen = typeof moveState.fen === "string" ? moveState.fen.trim() : "";
                            const latestFen = typeof latestGame?.fen === "string" ? latestGame.fen.trim() : "";
                            if (attemptedFen && attemptedFen === latestFen) {
                                return {
                                    status: MOVE_STATUS.DUPLICATE,
                                    gameID,
                                    fen: latestGame?.fen,
                                    lastSeq: latestGame?.lastSeq ?? 0,
                                    lastMove: latestGame?.lastMove ?? null,
                                };
                            }
                        }
                        throw error;
                    }
                }
                return moveState;
            }
            case BOARD_TYPE.HALL: {
                const moveState = await processMoveHall({boardType, gameID, moveType, uci, departures, arrivals }) as MoveState;
                if (moveState.status === MOVE_STATUS.OK) {
                    const persistedUci = moveState.isError ? `dep:${departures ?? ""} arr:${arrivals ?? ""}` : uci;
                    await afterMove(gameID, moveState, persistedUci, moveState.lastSeq ?? 0, boardType, moveState.fen, expectedVersion);
                }
                return moveState;
            }
            default:
                console.error("Unknown boardType: ", boardType);
                return { error: true, message: `Unknown boardType: ${boardType}` };
        }
    },
}
