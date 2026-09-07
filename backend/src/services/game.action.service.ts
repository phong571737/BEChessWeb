import { resetGame } from "../game/game.manager.js";
import { Chess } from "chess.js";
import { getGame, renamePlayer, saveActiveGameHistorySnapshot, saveGame, removeGame } from "../models/game.model.js";
import { games, gameSeq, activeBranches, rawFenHistory, rawMoveHistory, pgnBaseFen } from "../game/game.repository.js";
import { gameState, emitGameState } from "../game/game.state.js";
import { getIO } from "../sockets/index.js";
import { ERROR_STATUS } from "../constant.js";
import { BulkGameSetupItem, GameIDPayload } from "../types/game.types.js";
import { getBoardIDByGame } from "../game/game.manager.js";
import { getCurrentClock } from "./clock.service.js";

export const GameActionService = {
    // Restart keeps the existing game/session identity so clients and board mapping stay connected.
    async restart(gameID: string): Promise<GameIDPayload & { boardID: string; initialTimeMs?: number; incrementMs?: number }> {
        const game = await getGame(gameID);
        if (!game) {
            throw new Error(ERROR_STATUS.NOTFOUND);
        }
        const boardID = game.boardID ?? getBoardIDByGame(gameID);
        if (!boardID) {
            throw new Error(`Game ${gameID} is missing boardID`);
        }

        const resetAt = Date.now();
        const initialTimeMs = game.initialTimeMs ?? (game.clockSeconds ? game.clockSeconds * 1_000 : undefined);
        const incrementMs = game.incrementMs ?? (game.clockIncrement ? game.clockIncrement * 1_000 : undefined);
        const initialFen = new Chess().fen();
        const transition = await saveGame(gameID, {
            fen: initialFen,
            initialFen,
            pgn: "",
            lastMove: null,
            lastSeq: 0,
            result: "*",
            status: "waiting",
            startedAt: null,
            lastMoveAt: null,
            durationSec: 0,
            branches: [],
            uciHistory: [],
            fenHistory: [],
            moveDurationsMs: [],
            whiteRemainingMs: initialTimeMs,
            blackRemainingMs: initialTimeMs,
            activeClockSide: "white",
            clockStartedAt: null,
        }, { expectedVersion: game.version ?? 0, expectedStatus: ["waiting", "ready", "playing", "active", "idle"] });
        if (!transition?.modifiedCount) {
            throw new Error("GAME_STATE_CONFLICT");
        }
        const reset = resetGame(gameID);
        // A physical-board scan must validate the reset position before a new game can start.
        gameState.set(boardID, { gameID, gameStatus: "checkinit", initResultStatus: "checkinit", buttonReady: false, wrongSquares: [], missingSquares: [] });
        emitGameState(boardID);
        // Home-page physical-board cards are not members of the game room.
        // Broadcast the retained board/game association so the card remains visible after restart.
        getIO().emit("game_status_update", { gameID, boardID, status: "waiting" });
        getIO().to(gameID).emit("game:reset", {
            gameID,
            boardID,
            fen: reset.fen(),
            resetAt,
            initialTimeMs,
            incrementMs,
        });
        getIO().to(gameID).emit("clock_state", {
            gameID,
            whiteRemainingMs: initialTimeMs ?? 0,
            blackRemainingMs: initialTimeMs ?? 0,
            activeClockSide: "white",
            clockStartedAt: null,
            serverNow: resetAt,
            fen: initialFen,
        });

        return {
            gameID,
            boardID,
            initialTimeMs,
            incrementMs,
        }
    },

    // Kept for the reset endpoint; it uses the same in-place restart behavior.
    async reset(gameID: string): Promise<void> {
        await GameActionService.restart(gameID);
    },

    async rename(gameID: string, color: string, name: string, initialTimeMs?: number, incrementMs?: number, round?: number, location?: string, boardNumber?: string): Promise<Record<string, unknown> | null> {
        if (!name.trim() || !["Black", "White"].includes(color)) {
            return null;
        }

        const game = await getGame(gameID);
        if (!game) return null;

        const updatedGame = await renamePlayer(gameID, color, name, initialTimeMs, incrementMs, round, location, boardNumber);
        if (updatedGame && ((updatedGame.lastSeq ?? 0) > 0 || (updatedGame.uciHistory?.length ?? 0) > 0)) {
            await saveActiveGameHistorySnapshot(updatedGame);
        }
        // Broadcast to all clients in the game room so board page can update immediately
        const payload: Record<string, any> = { gameID };
        if (boardNumber !== undefined) payload.boardNumber = boardNumber;
        if (color === "White") payload.whiteName = name;
        if (color === "Black") payload.blackName = name;
        if (initialTimeMs !== undefined) payload.initialTimeMs = initialTimeMs;
        if (incrementMs !== undefined) payload.incrementMs = incrementMs;
        if (round !== undefined) payload.round = round;
        if (location !== undefined) payload.location = location;
        getIO().to(gameID).emit("game:renamed", payload);

        // Keep every connected client on the same server-authoritative clock,
        // including clients that are viewing the game while it is configured.
        const clockState = {
            gameID,
            ...getCurrentClock(updatedGame),
        };
        getIO().to(gameID).emit("clock_state", clockState);
        return clockState;
    },

    /** Applies one pairing workbook to multiple live boards without resetting active clocks. */
    async bulkSetup(
        items: BulkGameSetupItem[],
        clock: { applyClock: boolean; initialTimeMs?: number; incrementMs?: number },
    ): Promise<{ updated: string[]; failed: { gameID: string; error: string }[] }> {
        const updated: string[] = [];
        const failed: { gameID: string; error: string }[] = [];

        // Sequential writes avoid multiple configuration writes racing against
        // the same physical-board move stream. Each individual write remains
        // guarded by the game's optimistic version.
        for (const item of items) {
            try {
                const whiteUpdate = await GameActionService.rename(
                    item.gameID,
                    "White",
                    item.whiteName,
                    clock.applyClock ? clock.initialTimeMs : undefined,
                    clock.applyClock ? clock.incrementMs : undefined,
                    item.round,
                    item.location,
                    item.boardNumber,
                );
                if (!whiteUpdate) throw new Error("GAME_NOT_FOUND");
                const blackUpdate = await GameActionService.rename(item.gameID, "Black", item.blackName);
                if (!blackUpdate) throw new Error("GAME_NOT_FOUND");
                updated.push(item.gameID);
            } catch (error) {
                failed.push({
                    gameID: item.gameID,
                    error: error instanceof Error ? error.message : "BULK_SETUP_FAILED",
                });
            }
        }
        return { updated, failed };
    },

    async destroy(gameID: string) {
        // Cleanup RAM trước khi xóa DB
        games.delete(gameID);
        gameSeq.delete(gameID);
        activeBranches.delete(gameID);
        rawMoveHistory.delete(gameID);
        rawFenHistory.delete(gameID);
        pgnBaseFen.delete(gameID);
        return await removeGame(gameID);
    },
}
