import { Chess } from "chess.js";
import { getGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";
import { ChessService } from "../services/chess.service.js";
import { buildResponse, executeMove, formatUCI, parseUCI } from "../utils/chess.utils.js";
import { createBranches } from "../services/game.service.js";
import { ERROR_STATUS, MOVE_STATUS, MOVE_TYPE } from "../constant.js";
import { games, gameSeq, activeBranches, currentGameByBoard } from "./game.repository.js";
import { printBranches } from "../utils/debug.branch.js";
import { handleBranchMove } from "../services/branch.service.js";

export async function restorefromDB(gameID) {
  const data = await getGame(gameID);
  if (!data) return null;

  const game = new Chess();
  if (data.pgn) {
    game.loadPgn(data.pgn);
  } else if (data.fen) {
    game.load(data.fen);
  }

  games.set(gameID, game);
  gameSeq.set(gameID, data.lastSeq ?? 0);
  return game;
}

/**This function is used to create make move */
export async function makeMove(gameID, candidates, seq, moveType) {
  if (!candidates?.length || seq === undefined) {
    return { status: ERROR_STATUS.INVALID };
  }

  if (!games.has(gameID)) {
    const restored = await restorefromDB(gameID);
    if (!restored) return { status: ERROR_STATUS.NOTFOUND };
  }

  const mainGame = games.get(gameID);
  const lastSeq = gameSeq.get(gameID) ?? 0;
  const expectedSeq = lastSeq + 1;

  //duplicated
  if (seq < expectedSeq) return { status: MOVE_STATUS.DUPLICATE, fen: mainGame.fen(), lastSeq };
  //Out of order
  if (seq > expectedSeq) return { status: MOVE_STATUS.OUT_OF_SEQ, expectedSeq, lastSeq };

  // Resolve branches
  if (activeBranches.has(gameID)) {
    return handleBranchMove(gameID, mainGame, candidates, seq, moveType);
  }

  // Don't have activeBranches
  let validMoves = ChessService.findValidMove(mainGame, candidates);

  if (validMoves.length > 1 || validMoves.length === 0) {
    // create from square
    let movestoBranch = validMoves;

    if (validMoves.length === 0) {
      const fromSq = candidates[0]?.slice(0, 2);
      let allMoves = fromSq
        ? mainGame.moves({ square: fromSq, verbose: true })
        : [];

      if (moveType === MOVE_TYPE.CAPTURE && allMoves.length > 0) {
        const captureMoves = allMoves.filter(
          m => m.flags.includes('c')
        );
        movestoBranch = captureMoves.length > 0 ? captureMoves : allMoves;
      } else {
        movestoBranch = allMoves;
      }

      if (movestoBranch.length === 0) {
        gameSeq.set(gameID, seq);
      }
    }

    const branches = createBranches(mainGame, movestoBranch).map(b => ({
      ...b,
      fromIllegal: validMoves.length === 0,
    }));

    activeBranches.set(gameID, branches);
    printBranches(gameID);
    gameSeq.set(gameID, seq);

    return buildResponse(gameID, mainGame, seq, {
      ambiguity: true,
      branches: branches.length,
      lastMove: branches[0]?.lastApplied ?? null,
    })
  }

  // Exactly 1 valid move
  const mv = validMoves[0];
  executeMove(mainGame, mv);
  gameSeq.set(gameID, seq);

  return {
    status: MOVE_STATUS.OK,
    gameID,
    fen: mainGame.fen(),
    pgn: mainGame.pgn(),
    lastSeq: seq,
    lastMove: {
      from: validMoves[0].from,
      to: validMoves[0].to,
      promotion: validMoves[0].promotion ?? null,
      uci: validMoves[0].uci
    }
  }
}

/**This function is used to create game  */
export function createGame(gameID) {
  if (games.has(gameID)) { // if the game is exists
    return games.get(gameID);
  }

  const game = new Chess();
  games.set(gameID, game);
  return game;
}

/**This function is used to get current game state */
export async function getCurrentState(gameID) {
  let game = games.get(gameID);
  // create a game if game is not exists
  if (!game) {
    game = await restorefromDB(gameID);
    if (!game) return null;
  }

  return {
    gameID,
    fen: game.fen(),
    lastMove: null
  };
}

export function loadPGN(gameID, pgn) {
  const game = games.get(gameID);
  if (!game) throw new Error("Game not found");

  game.loadPgn(pgn);
}

/**This function is used to reset the game 
 * to its initial state */
export function resetGame(gameID) {
  //Create a new one if it is not already in RAM
  if (!games.has(gameID)) {
    games.set(gameID, new Chess());
  }

  const game = games.get(gameID);
  if (!game)
    throw new Error("Game not found");
  game.reset();
  gameSeq.set(gameID, 0);
  return game
}

/**This function is used to destroy board */
export function destroyBoard(gameID) {
  if (!games.has(gameID)) {
    games.set(gameID, new Chess());
  }

  const game = games.get(gameID);
  game.destroy();
}

// Map boarid to gameid
export function setCurrentGame(boardID, gameID) {
  console.log("SET CURRENT GAME");
  console.log(boardID, gameID);

  currentGameByBoard.set(boardID, gameID);

  console.log(currentGameByBoard);
}

// Get gameID from boardID
export function getCurrentGame(boardID) {
  return currentGameByBoard.get(boardID);
}