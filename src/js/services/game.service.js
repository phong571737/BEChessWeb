import { createGame } from "../game/game.manager.js";
import { saveGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";

export const GameService = {
  // create game
  async create(gameID) {
    const chess = createGame(gameID);
    await saveGame(gameID, {
      gameID,
      fen: chess.fen(),
      pgn: "",
      lastMove: null
    });

    getIO().to(gameID).emit("board_connected", { gameID });
    return chess;
  },
}




