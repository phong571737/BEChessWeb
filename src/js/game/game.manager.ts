import { Chess, PieceSymbol, Square } from "chess.js";
import { getGame } from "../models/game.model.js";
import { ChessService } from "../services/chess.service.js";
import { buildResponse, executeMove, formatUCI } from "../utils/chess.utils.js";
import { createBranches } from "../services/game.service.js";
import { Branch } from "../types/chess.types.js";
import { BOARD_TYPE, ERROR_STATUS, MOVE_STATUS, MOVE_TYPE } from "../constant.js";
import { games, gameSeq, activeBranches, currentGameByBoard, boardIDByGame, pgnBaseFen } from "./game.repository.js";
import { printBranches } from "../utils/debug.branch.js";
import { handleBranchMove } from "../services/branch.service.js";
import { serializeBranches } from "../utils/branch.utils.js";
import { MoveState } from "../types/move.types.js";
import { applyRawMove } from "../utils/chess.utils.js";
import { customPGN } from "../utils/custom.chess.js";
import { rawMoveHistory } from "./game.repository.js";

export async function restorefromDB(gameID: string) {
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
export async function makeMove(
  gameID: string, candidates: string[], seq: number, moveType: string, boardType: string, fen?: string
): Promise<MoveState> {
  if (!candidates?.length || seq === undefined) {
    return { status: ERROR_STATUS.INVALID, gameID };
  }

  if (!games.has(gameID)) {
    const restored = await restorefromDB(gameID);
    if (!restored) return { status: ERROR_STATUS.NOTFOUND };
  }

  const mainGame = games.get(gameID);
  const lastSeq = gameSeq.get(gameID) ?? 0;

  if (boardType === BOARD_TYPE.HALL) {
    if (activeBranches.has(gameID)) { // Resolve branches
      return handleBranchMove(gameID, mainGame, candidates, seq, moveType);
    }

    if (moveType === MOVE_TYPE.CAPTURE) {
      return handleNewCaptureMove(gameID, mainGame, candidates, seq);
    }

    if (moveType === MOVE_TYPE.MOVE_ERROR) {
      return handleErrorMove(gameID, mainGame, candidates, seq);
    }

    // another moveType
    return handleNewNormalMove(gameID, mainGame, candidates, seq);
  } else if (boardType === BOARD_TYPE.NFC) {
    gameSeq.set(gameID, seq);
    // const existingMoves = rawMoveHistory.get(gameID) ?? [];
    // const { pgn: customPgn } = customPGN(existingMoves);

    if (moveType === MOVE_TYPE.MOVE_ERROR) {
      const newFen = fen ?? mainGame.fen();
      try {
        mainGame.load(newFen, { skipValidation: true });
      } catch (e) {
        console.error("[MOVE_ERROR] Failed to load fen:", newFen, e);
      }
      rawMoveHistory.set(gameID, []);
      pgnBaseFen.set(gameID, newFen);
      const { pgn: freshPgn } = customPGN([], newFen);

      return {
        status: MOVE_STATUS.OK,
        gameID,
        fen: fen ?? mainGame.fen(),
        pgn: freshPgn,
        lastSeq: seq,
        lastMove: null,
        isError: true,
      } as MoveState
    }
    return handleNFCMove(gameID, mainGame, candidates, seq);
  }

  return { status: ERROR_STATUS.INVALID };
}

// This function is used to for NFC
function handleNFCMove(gameID: string, mainGame: Chess, candidates: string[], seq: number): MoveState {
  const uci = candidates[0];
  if (!uci || uci.length < 4) {
    console.log(`[NFC MOVE] Invalid uci format: ${uci}, ignoring`);
    gameSeq.set(gameID, seq);
    return buildResponse(gameID, mainGame, seq, { invalidMove: true });
  }

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;

  const result = applyRawMove(mainGame, from, to, promotion);

  if (!result) {
    console.log(`[NFC MOVE] No piece at ${from}, ignoring`);
    gameSeq.set(gameID, seq);
    return buildResponse(gameID, mainGame, seq, { invalidMove: true });
  }

  if (!rawMoveHistory.has(gameID)) rawMoveHistory.set(gameID, []);
  rawMoveHistory.get(gameID)!.push({ from: from as Square, to: to as Square, promotion: promotion as PieceSymbol });

  const { pgn: customPgn } = customPGN(rawMoveHistory.get(gameID)!);
  gameSeq.set(gameID, seq);

  return {
    status: MOVE_STATUS.OK,
    gameID,
    fen: mainGame.fen(),
    pgn: customPgn,
    lastSeq: seq,
    lastMove: {
      from,
      to,
      promotion: promotion ?? null,
      uci: formatUCI(from, to, promotion),
    },
  };
}

/**handle when receive multimove */
function handleErrorMove(gameID: string, mainGame: Chess, candidates: string[], seq: number): MoveState {
  const validMoves = candidates.flatMap(fromSq =>
    mainGame.moves({ square: fromSq as Square, verbose: true })
  );

  if (validMoves.length === 0) {
    console.log(`[ERROR MOVE] No valid moves from ${candidates}, ignoring`);
    gameSeq.set(gameID, seq);
    return buildResponse(gameID, mainGame, seq, { invalidMove: true });
  }

  if (validMoves.length === 1) {
    // Exactly 1 valid move
    const mv = validMoves[0];
    if (!mv) {
      console.log(`[ERROR MOVE] validMoves[0] unexpectedly undefined from ${candidates}, ignoring`);
      gameSeq.set(gameID, seq);
      return buildResponse(gameID, mainGame, seq, { invalidMove: true });
    }
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

function handleNewNormalMove(gameID: string, mainGame: Chess, candidates: string[], seq: number): MoveState {
  const validMoves = ChessService.findValidMove(mainGame, candidates);

  if (validMoves.length === 0) {
    console.log(`[NEW MOVE] No valid move for ${JSON.stringify(candidates)}, ignoring`);
    gameSeq.set(gameID, seq);
    return buildResponse(gameID, mainGame, seq, { invalidMove: true });
  }

  if (validMoves.length === 1) {
    // Exactly 1 valid move
    const mv = validMoves[0];
    if (!mv) {
      console.log(`[NEW MOVE] validMoves[0] unexpectedly undefined for ${JSON.stringify(candidates)}, ignoring`);
      gameSeq.set(gameID, seq);
      return buildResponse(gameID, mainGame, seq, { invalidMove: true });
    }
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

  const branches: Branch[] = createBranches(mainGame, validMoves);
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
function handleNewCaptureMove(gameID: string, mainGame: Chess, candidates: string[], seq: number): MoveState {
  const fromSq = candidates[0]?.slice(0, 2);

  if (!fromSq) {
    return { status: ERROR_STATUS.INVALID, gameID };
  }

  const captureMove = mainGame.moves({ square: fromSq as never, verbose: true })
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
    if (!mv) {
      console.log(`[NEW CAPTURE] captureMove[0] unexpectedly undefined from ${fromSq}, ignoring`);
      gameSeq.set(gameID, seq);
      return buildResponse(gameID, mainGame, seq, { invalidMove: true });
    }
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
export function createGame(gameID: string): Chess {
  if (games.has(gameID)) { // if the game is exists
    return games.get(gameID);
  }

  const game = new Chess();
  game.setHeader("Round", "1");
  games.set(gameID, game);
  return game;
}

/**This function is used to get current game state */
export async function getCurrentState(
  gameID: string
): Promise<{ gameID: string, fen: string, lastMove: null } | null> {
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

export function loadPGN(gameID: string, pgn: string): void {
  const game = games.get(gameID);
  if (!game) throw new Error("Game not found");

  game.loadPgn(pgn);
}

/**This function is used to reset the game 
 * to its initial state */
export function resetGame(gameID: string): Chess {
  //Create a new one if it is not already in RAM
  if (!games.has(gameID)) {
    games.set(gameID, new Chess());
  }

  const game = games.get(gameID);
  if (!game)
    throw new Error("Game not found");
  game.reset();
  gameSeq.set(gameID, 0);
  activeBranches.delete(gameID);
  rawMoveHistory.delete(gameID);
  pgnBaseFen.delete(gameID);
  return game
}

/**This function is used to destroy board */
export function destroyBoard(gameID: string): void {
  if (!games.has(gameID)) {
    games.set(gameID, new Chess());
  }

  const game = games.get(gameID);
  game.destroy();
}

// Map boarid to gameid
export function setCurrentGame(boardID: string, gameID: string): void {
  console.log("SET CURRENT GAME");
  console.log(boardID, gameID);

  // clean up old game
  const oldGameID = currentGameByBoard.get(boardID);
  if (oldGameID && oldGameID !== gameID) {
    boardIDByGame.delete(oldGameID);
  }

  currentGameByBoard.set(boardID, gameID);
  boardIDByGame.set(gameID, boardID);

  console.log(currentGameByBoard);
}

// Get gameID from boardID
export function getCurrentGame(boardID: string): string | undefined {
  return currentGameByBoard.get(boardID);
}

// get boardID from gameID
export function getBoardIDByGame(gameID: string): string | undefined {
  return boardIDByGame.get(gameID);
}

export function removeCurrenGame(boardID: string): void {
  const gameID = currentGameByBoard.get(boardID);
  currentGameByBoard.delete(boardID);
  if (gameID) boardIDByGame.delete(gameID);
}