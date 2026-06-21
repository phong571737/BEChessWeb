import { Chess } from "chess.js";
import { createGame, setCurrentGame } from "../game/game.manager.js";
import { saveGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";
import { executeMove } from "../utils/chess.utils.js";

export const GameService = {
  // create game
  async create(boardID, gameID, round = 1, WhiteName = "", BlackName = "") {
    const chess = createGame(gameID);
    
    await saveGame(gameID, {
      gameID,
      boardID,
      fen: chess.fen(),
      pgn: "",
      lastMove: null,
      round,
      WhiteName: WhiteName,
      BlackName: BlackName,
    });

    setCurrentGame(boardID, gameID);

    return { boardID, gameID, fen: chess.fen(), round};
  },
}

// This function is used to create a branch when validation move
export function createBranches(game, valid_move) {
  return valid_move.map((mv, i) => {
    const clone = new Chess();

    clone.loadPgn(game.pgn());
    executeMove(clone, mv);

    return { 
      id: `branch_${i}`, 
      move: mv, 
      fen: clone.fen(), 
      pgn: clone.pgn(), 
      lastApplied: mv,
      step: 1 // a number of steps in branch
    };
  });
}

export function ensureGameExists() {
  
}



