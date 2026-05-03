import { Chess } from "chess.js";
import { resetGame } from "../game/game.manager.js";
import { loadGame, renamePlayer, saveGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";
import { createNewGame, endLog } from "../models/log.model.js";

export const GameActionService = {
    // restart game when the restart button is pressed
    async restart(gameID) {

        // close the old game
        await endLog(gameID, "restart");

        // create a new sesion
        const sessionId = await createNewGame(gameID);
        //Reset game
        resetGame(gameID);

        await saveGame(gameID, {
            gameID,
            sessionId,
            fen: new Chess().fen(),
            pgn: "",
            lastMove: null,
            lastSeq: 0
        });

        getIO().emit("game_restart", { gameID, sessionId});
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

        const game = await loadGame(gameID);
        if (!game) return;

        await renamePlayer(gameID, color, name);
        // Broad cast to all the game that using name gameid
        getIO().to(gameID).emit("game:renamed", {color, name});
    },

    async destroy(gameID) {
       return await removeGame(gameID);
    },
}