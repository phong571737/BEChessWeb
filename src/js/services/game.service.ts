import { Chess } from "chess.js";
import { createGame, getCurrentGame, setCurrentGame } from "../game/game.manager.js";
import { saveGame, removeGameByBoardID } from "../models/game.model.js";
import { executeMove } from "../utils/chess.utils.js";
import { activeBranches, games, gameSeq, rawMoveHistory, pgnBaseFen } from "../game/game.repository.js";
import { gameState } from "../game/game.state.js";
import { MoveLike, Branch } from "../types/chess.types.js";

export const GameService = {
  // create game
  async create(boardID: string, gameID: string, round: number = 1, WhiteName = "", BlackName = "", clockSeconds?: number, clockIncrement?: number) {
    // Clean up ALL old game records (active or finished) for this boardID from DB & RAM
    const result = await removeGameByBoardID(boardID);
    if (result?.gameIDs?.length) {
      for (const oldId of result.gameIDs) {
        games.delete(oldId);
        gameSeq.delete(oldId);
        activeBranches.delete(oldId);
        rawMoveHistory.delete(oldId);
        pgnBaseFen.delete(oldId);
      }
      console.log(`[GameService] Cleaned ${result.gameIDs.length} old game(s) for board ${boardID} from DB & RAM`);
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
      clockSeconds,
      clockIncrement,
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



