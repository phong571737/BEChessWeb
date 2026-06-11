import { Chess } from "chess.js";
import { getGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";
import { ChessService } from "../services/chess.service.js";
import { buildResponse, executeMove, formatUCI, parseUCI } from "../utils/chess.utils.js";
import { createBranches } from "../services/game.service.js";
import { BOARD_TYPE, ERROR_STATUS, MOVE_STATUS, MOVE_TYPE } from "../constant.js";
import { games, gameSeq, activeBranches, currentGameByBoard } from "./game.repository.js";
import { printBranches } from "../utils/debug.branch.js";
import { handleBranchMove } from "../services/branch.service.js";
import { serializeBranches } from "../utils/branch.utils.js";

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
export async function makeMove(gameID, candidates, seq, moveType, boardType) {
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

  if (boardType === BOARD_TYPE.HALL) {
    if (activeBranches.has(gameID)) { // Resolve branches
      return handleBranchMove(gameID, mainGame, candidates, seq, moveType);
    }

    if (moveType === MOVE_TYPE.CAPTURE) {
      return handleNewCaptureMove(gameID, mainGame, candidates, seq);
    }

    // another moveType
    return handleNewNormalMove(gameID, mainGame, candidates, seq);
  } else if (boardType === BOARD_TYPE.NFC) {
    const result = handleNFCMove(gameID, mainGame, candidates, seq);

    return result.status !== MOVE_STATUS.OK
      ? { ...result, fen: currentFen }
      : result;
  }

  return { status: ERROR_STATUS.INVALID };
}

// This function is used to for NFC
function handleNFCMove(gameID, mainGame, candidates, seq) {
  const validMoves = ChessService.findValidMove(mainGame, candidates);

  if (validMoves.length === 0) {
    console.log(`[NFC MOVE] No valid move for ${JSON.stringify(candidates)}, ignoring`);
    gameSeq.set(gameID, seq);
    return buildResponse(gameID, mainGame, seq, { invalidMove: true });
  }

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
      from: mv.from,
      to: mv.to,
      promotion: mv.promotion ?? null,
      uci: formatUCI(mv.from, mv.to, mv.promotion),
    },
    branches: [],
    branchCount: 0,
  };
}

function handleNewNormalMove(gameID, mainGame, candidates, seq) {
  const validMoves = ChessService.findValidMove(mainGame, candidates);

  if (validMoves.length === 0) {
    console.log(`[NEW MOVE] No valid move for ${JSON.stringify(candidates)}, ignoring`);
    gameSeq.set(gameID, seq);
    return buildResponse(gameID, mainGame, seq, { invalidMove: true });
  }

  if (validMoves.length === 1) {
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
        from: mv.from,
        to: mv.to,
        promotion: mv.promotion ?? null,
        uci: formatUCI(mv.from, mv.to, mv.promotion),
      },
      branches: [],
      branchCount: 0,
    }
  }

  const branches = createBranches(mainGame, validMoves);
  activeBranches.set(gameID, branches);
  gameSeq.set(gameID, seq);
  printBranches(gameID);

  return {
    status: MOVE_STATUS.OK,
    gameID,
    fen: mainGame.fen(),
    pgn: mainGame.pgn(),
    lastSeq: seq,
    branches: serializeBranches(branches),
    branchCount: branches.length,
  };
}

/**first CAPTURE
 * find all move fromsq
 */
function handleNewCaptureMove(gameID, mainGame, candidates, seq) {
  const fromSq = candidates[0]?.slice(0, 2);

  if (!fromSq) {
    return { status: ERROR_STATUS.INVALID };
  }

  const captureMove = mainGame.moves({ square: fromSq, verbose: true })
    .filter((m) => m.flags.includes("c") || m.flags.includes("e"));

  // Don't have any capture
  if (captureMove.length === 0) {
    console.log(`[NEW CAPTURE] No valid capture from ${fromSq}, ignoring`);
    gameSeq.set(gameID, seq);
    return buildResponse(gameID, mainGame, seq, { invalidMove: true });
  }

  // 1 capture, apply
  if (captureMove.length === 1) {
    const mv = captureMove[0];
    executeMove(mainGame, mv);
    gameSeq.set(gameID, seq);
    return {
      status: MOVE_STATUS.OK,
      gameID,
      fen: mainGame.fen(),
      pgn: mainGame.pgn(),
      lastSeq: seq,
      lastMove: {
        from: mv.from,
        to: mv.to,
        promotion: mv.promotion ?? null,
        uci: formatUCI(mv.from, mv.to, mv.promotion),
      },
      branches: [],
      branchCount: 0,
    }
  }

  // capture > 1, create branches
  const branches = createBranches(mainGame, captureMove);
  activeBranches.set(gameID, branches);
  gameSeq.set(gameID, seq);
  printBranches(gameID);

  return {
    status: MOVE_STATUS.OK,
    gameID,
    fen: mainGame.fen(),
    pgn: mainGame.pgn(),
    lastSeq: seq,
    branches: serializeBranches(branches),
    branchCount: branches.length,
  };
}


/**This function is used to create game  */
export function createGame(gameID) {
  if (games.has(gameID)) { // if the game is exists
    return games.get(gameID);
  }

  const game = new Chess();
  game.setHeader("Round", "1");
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