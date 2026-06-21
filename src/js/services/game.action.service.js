import { Chess } from "chess.js";
import { resetGame, setCurrentGame } from "../game/game.manager.js";
import { getGameCollections, getGame, renamePlayer, saveGame, removeGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";
import { ERROR_STATUS } from "../constant.js";
import { GameService } from "./game.service.js";

export const GameActionService = {
    // restart game when the restart button is pressed
    async restart(oldGameID) {
        // close the old game
        const oldGame = await getGame(oldGameID);

        if (!oldGame) {
            throw new Error(ERROR_STATUS.NOTFOUND);
        }

        // remove old game
        await removeGame(oldGameID);

        // create a new game id
        const newGameID = crypto.randomUUID(); 

        // Create a new game from the same board
        const newGame = await GameService.create(oldGame.boardID, newGameID);

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
    async reset(gameID) {
        // Reset server 
        resetGame(gameID);
        await saveGame(gameID, {
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            pgn: "",
            lastMove: null,
            lastSeq: 0,
        });
    },

    async rename(gameID, color, name) {
        if (!name.trim() || !["Black", "White"].includes(color)) {
            return;
        }

        const game = await getGame(gameID);
        if (!game) return;

        await renamePlayer(gameID, color, name);
        // Broad cast to all the game that using name gameid
        getIO().to(gameID).emit("game:renamed", {color, name});
    },

    async destroy(gameID) {
       return await removeGame(gameID);
    },
}