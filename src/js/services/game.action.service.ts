import { resetGame } from "../game/game.manager.js";
import { getGame, renamePlayer, saveGame, removeGame } from "../models/game.model.js";
import { games, gameSeq, activeBranches, rawMoveHistory, pgnBaseFen } from "../game/game.repository.js";
import { getIO } from "../sockets/index.js";
import { ERROR_STATUS } from "../constant.js";
import { GameService } from "./game.service.js";
import { GameIDPayload } from "../types/game.types.js";
import { getBoardIDByGame } from "../game/game.manager.js";

export const GameActionService = {
    // restart game when the restart button is pressed
    async restart(oldGameID: string): Promise<GameIDPayload> {
        // close the old game
        const oldGame = await getGame(oldGameID);

        if (!oldGame) {
            throw new Error(ERROR_STATUS.NOTFOUND);
        }
        const boardID = oldGame.boardID ?? getBoardIDByGame(oldGameID);
        if (!boardID) {
            throw new Error(`Game ${oldGameID} is missing boardID`);
        }
        
        const newGameID: string = crypto.randomUUID(); // create a new game id
        
        // Create a new game from the same board
        const newGame = await GameService.create(
            boardID,
            newGameID,
            (oldGame.round ?? 0) + 1,
            oldGame.WhiteName ?? "",
            oldGame.BlackName ?? "",
            oldGame.initialTimeMs ?? (oldGame.clockSeconds ? oldGame.clockSeconds * 1_000 : undefined),
            oldGame.incrementMs ?? (oldGame.clockIncrement ? oldGame.clockIncrement * 1_000 : undefined),
        );
        await removeGame(oldGameID); // remove old game from DB

        // Xóa hoàn toàn game cũ khỏi RAM
        games.delete(oldGameID);
        gameSeq.delete(oldGameID);
        activeBranches.delete(oldGameID);
        rawMoveHistory.delete(oldGameID);
        pgnBaseFen.delete(oldGameID);

        getIO().emit("game_restart", {
            oldGameID,
            gameID: newGameID,
            boardID: oldGame.boardID,
        });

        return {
            gameID: newGameID
        }
    },

    // reset game 
    async reset(gameID: string): Promise<void> {
        // Reset server 
        resetGame(gameID);
        await saveGame(gameID, {
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            pgn: "",
            lastMove: null,
            lastSeq: 0,
        });
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
