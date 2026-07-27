import { resetGame } from "../game/game.manager.js";
import { getGame, renamePlayer, saveGame, removeGame } from "../models/game.model.js";
import { games, gameSeq, activeBranches, rawMoveHistory, pgnBaseFen } from "../game/game.repository.js";
import { gameState, emitGameState } from "../game/game.state.js";
import { getIO } from "../sockets/index.js";
import { ERROR_STATUS } from "../constant.js";
import { GameIDPayload } from "../types/game.types.js";
import { getBoardIDByGame } from "../game/game.manager.js";

export const GameActionService = {
    // Restart keeps the existing game/session identity so clients and board mapping stay connected.
    async restart(gameID: string): Promise<GameIDPayload> {
        const game = await getGame(gameID);
        if (!game) {
            throw new Error(ERROR_STATUS.NOTFOUND);
        }
        const boardID = game.boardID ?? getBoardIDByGame(gameID);
        if (!boardID) {
            throw new Error(`Game ${gameID} is missing boardID`);
        }

        const reset = resetGame(gameID);
        const resetAt = Date.now();
        await saveGame(gameID, {
            fen: reset.fen(),
            initialFen: reset.fen(),
            pgn: "",
            lastMove: null,
            lastSeq: 0,
            totalMoves: 0,
            result: "*",
            status: "waiting",
            branches: [],
            uciHistory: [],
            fenHistory: [],
        });
        gameState.set(boardID, { gameID, gameStatus: "ready", wrongSquares: [], missingSquares: [] });
        emitGameState(boardID);
        getIO().to(gameID).emit("game:reset", { gameID, boardID, fen: reset.fen(), resetAt });

        return {
            gameID
        }
    },

    // Kept for the reset endpoint; it uses the same in-place restart behavior.
    async reset(gameID: string): Promise<void> {
        await GameActionService.restart(gameID);
    },

    async rename(gameID: string, color: string, name: string, initialTimeMs?: number, incrementMs?: number): Promise<void> {
        if (!name.trim() || !["Black", "White"].includes(color)) {
            return;
        }

        const game = await getGame(gameID);
        if (!game) return;

        await renamePlayer(gameID, color, name, initialTimeMs, incrementMs);
        // Broadcast to all clients in the game room so board page can update immediately
        const payload: Record<string, any> = { gameID };
        if (color === "White") payload.WhiteName = name;
        if (color === "Black") payload.BlackName = name;
        if (initialTimeMs !== undefined) payload.initialTimeMs = initialTimeMs;
        if (incrementMs !== undefined) payload.incrementMs = incrementMs;
        getIO().to(gameID).emit("game:renamed", payload);
    },

    async destroy(gameID: string) {
        // Cleanup RAM trước khi xóa DB
        games.delete(gameID);
        gameSeq.delete(gameID);
        activeBranches.delete(gameID);
        rawMoveHistory.delete(gameID);
        pgnBaseFen.delete(gameID);
        return await removeGame(gameID);
    },
}
