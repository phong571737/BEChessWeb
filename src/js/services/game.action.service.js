import { Chess } from "chess.js";
import { resetGame } from "../game/game.manager.js";
import { saveGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";

export const GameActionService = {
    // restart game when the restart button is pressed
    async restart(gameID) {
        //Reset game
        resetGame(gameID);

        await saveGame(gameID, {
            gameID,
            fen: new Chess().fen(),
            pgn: "",
            lastMove: null,
            lastSeq: 0
        });

        getIO().emit("game_restart", { gameID });
    },

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

    async destroy(gameID) {
       return await removeGame(gameID);
    },
}