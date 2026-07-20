import { resetGame } from "../game/game.manager.js";
import { getGame, renamePlayer, saveGame, removeGame } from "../models/game.model.js";
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
        const newGame = await GameService.create(boardID, newGameID);
        await removeGame(oldGameID); // remove old game

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

    async rename(gameID: string, color: string, name: string): Promise<void> {
        if (!name.trim() || !["Black", "White"].includes(color)) {
            return;
        }

        const game = await getGame(gameID);
        if (!game) return;

        await renamePlayer(gameID, color, name);
        // Broad cast to all the game that using name gameid
        getIO().to(gameID).emit("game:renamed", { color, name });
    },

    async destroy(gameID: string) {
        return await removeGame(gameID);
    },
}