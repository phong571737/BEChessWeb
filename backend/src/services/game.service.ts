import { Chess } from "chess.js";
import { createGame, destroyBoard, setCurrentGame } from "../game/game.manager.js";
import { acquireBoardCreationLock, closeActiveGamesForBoard, getLatestGameByBoardID, releaseBoardCreationLock, saveGame } from "../models/game.model.js";
import { executeMove } from "../utils/chess.utils.js";
import { activeBranches, games, gameSeq, rawMoveHistory, pgnBaseFen } from "../game/game.repository.js";
import { gameState } from "../game/game.state.js";
import { MoveLike, Branch } from "../types/chess.types.js";
import { classifyTimeControl, DEFAULT_INCREMENT_MS, DEFAULT_INITIAL_TIME_MS } from "../utils/time-control.js";

export const GameService = {
  // Only one creator may initialize a physical board at a time. Each
  // successful creation starts a fresh session with a new game ID.
  async create(boardID: string, gameID: string, round: number = 1, whiteName = "", blackName = "", initialTimeMs = DEFAULT_INITIAL_TIME_MS, incrementMs = DEFAULT_INCREMENT_MS) {
    if (!await acquireBoardCreationLock(boardID, gameID)) {
      throw new Error("BOARD_CREATION_IN_PROGRESS");
    }
    try {
      const previous = await getLatestGameByBoardID(boardID);
      await closeActiveGamesForBoard(boardID);
      if (previous?.gameID) destroyBoard(previous.gameID);

      const chess: Chess = createGame(gameID);
      await saveGame(gameID, {
        gameID,
        boardID,
        fen: chess.fen(),
        initialFen: chess.fen(),
        pgn: "",
        lastMove: null,
        round,
        status: "waiting",
        version: 0,
        whiteName,
        blackName,
        whiteRemainingMs: initialTimeMs,
        blackRemainingMs: initialTimeMs,
        activeClockSide: "white",
        clockStartedAt: null,
        clockVersion: 0,
        initialTimeMs,
        incrementMs,
        timeControlType: classifyTimeControl(initialTimeMs, incrementMs),
      });

      setCurrentGame(boardID, gameID);
      gameState.set(boardID, {gameID, gameStatus: "idle"});
      return { boardID, gameID, fen: chess.fen(), round, reused: false };
    } finally {
      await releaseBoardCreationLock(boardID, gameID);
    }
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

