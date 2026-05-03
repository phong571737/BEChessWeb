import { createGame } from "../game/game.manager.js";
import { saveGame } from "../models/game.model.js";

export const GameService = {
  async create(gameID, { WhiteName = "White", BlackName = "Black", status = "active" } = {}) {
    const chess = createGame(gameID);
    await saveGame(gameID, {
      gameID,
      WhiteName,
      BlackName,
      fen: chess.fen(),
      pgn: "",
      lastMove: null,
      lastSeq: 0,
      status,
    });
    return chess;
  },
}




