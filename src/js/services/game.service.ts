import { Chess } from "chess.js";
import { createGame, getCurrentGame, setCurrentGame } from "../game/game.manager.js";
import { saveGame } from "../models/game.model.js";
import { executeMove } from "../utils/chess.utils.js";
import { activeBranches, games, gameSeq } from "../game/game.repository.js";
import { gameState } from "../game/game.state.js";
import { MoveLike } from "../types/chess.types.js";
import { Branch } from "../types/chess.types.js";

export const GameService = {
  // create game
  async create(boardID: string, gameID: string, round: number = 1, WhiteName = "", BlackName = "") {
    // Remove old game from RAM first
    const oldGameID: string | undefined = getCurrentGame(boardID);
    if (oldGameID && oldGameID !== gameID) {
      games.delete(oldGameID);
      gameSeq.delete(oldGameID);
      activeBranches.delete(oldGameID);
      console.log(`Cleaned old game ${oldGameID} from RAM`);
    }

    const chess: Chess = createGame(gameID);
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
    gameState.set(boardID, {gameID, gameStatus: "idle"})

    return { boardID, gameID, fen: chess.fen(), round};
  },
}

// This function is used to create a branch when validation move
export function createBranches(game: Chess, valid_move: MoveLike[], parentId: string | null = null): Branch[] {
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
      step: 1, // a number of steps in branch
      parentId
    };
  });
}

export function ensureGameExists() {}



