import { Chess, PieceSymbol, Square } from "chess.js";
import { getAllGame, getGame, getLatestGameByBoardID } from "../models/game.model.js";
import { ChessService } from "../services/chess.service.js";
import { buildResponse, executeMove, formatUCI, inferMoveFromFen } from "../utils/chess.utils.js";
import { createBranches } from "../services/game.service.js";
import { Branch } from "../types/chess.types.js";
import { BOARD_TYPE, ERROR_STATUS, MOVE_STATUS, MOVE_TYPE } from "../constant.js";
import { games, gameSeq, activeBranches, currentGameByBoard, boardIDByGame, pgnBaseFen, rawFenHistory, rawMoveHistory } from "./game.repository.js";
import { printBranches } from "../utils/debug.branch.js";
import { handleBranchMove } from "../services/branch.service.js";
import { serializeBranches } from "../utils/branch.utils.js";
import { MoveState } from "../types/move.types.js";
import { applyRawMove } from "../utils/chess.utils.js";
import { buildPgnFromBoardHistory } from "../utils/pgn-history.js";

export async function restorefromDB(gameID: string) {
  const data = await getGame(gameID);
  if (!data) return null;

  const game = new Chess();
  if (data.fen) {
    try {
      game.load(data.fen, { skipValidation: true });
    } catch (e) {
      if (data.pgn) game.loadPgn(data.pgn);
    }
  } else if (data.pgn) {
    game.loadPgn(data.pgn);
  }

  games.set(gameID, game);
  gameSeq.set(gameID, data.lastSeq ?? 0);
  const persistedMoves = Array.isArray(data.uciHistory)
    ? data.uciHistory.map((uci) => {
      const match = typeof uci === "string" && uci.trim().match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
      return match
        ? { from: match[1] as Square, to: match[2] as Square, promotion: match[3]?.toLowerCase() as PieceSymbol | undefined }
        : { from: "--" as Square, to: "--" as Square };
    })
    : [];
  if (persistedMoves.length) rawMoveHistory.set(gameID, persistedMoves);
  if (Array.isArray(data.fenHistory) && data.fenHistory.length) {
    rawFenHistory.set(gameID, data.fenHistory.filter((fen): fen is string => typeof fen === "string" && Boolean(fen.trim())));
  }
  if (typeof data.initialFen === "string" && data.initialFen.trim()) pgnBaseFen.set(gameID, data.initialFen);
  return game;
}

/**
 * Rebuild runtime game sessions after a Node/Docker restart. MongoDB is the
 * durable source of truth; the repository maps are only an in-memory cache.
 */
export async function restoreActiveGamesFromDB(): Promise<number> {
  const activeGames = await getAllGame();
  let restoredCount = 0;

  for (const data of activeGames) {
    if (!data.boardID || !data.gameID || ["finished", "resigning", "ended"].includes(data.status ?? "")) continue;
    try {
      setCurrentGame(data.boardID, data.gameID);
      await restorefromDB(data.gameID);
      restoredCount += 1;
    } catch (error) {
      console.error(`Failed to restore active game ${data.gameID}`, error);
    }
  }

  return restoredCount;
}

function ensureRawHistory(gameID: string, game: Chess): void {
  if (!rawMoveHistory.has(gameID)) {
    rawMoveHistory.set(gameID, []);
    pgnBaseFen.set(gameID, game.fen());
  }
  if (!rawFenHistory.has(gameID)) rawFenHistory.set(gameID, []);
}

function rawMoveToUci(move: { from: Square; to: Square; promotion?: PieceSymbol }): string {
  if (String(move.from) === "--" || String(move.to) === "--") return "";
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

/** Build live notation without changing the history page's finalPGN flow. */
function buildLiveBoardPgn(gameID: string, fallbackFen: string): string {
  return buildPgnFromBoardHistory({
    initialFen: pgnBaseFen.get(gameID) ?? fallbackFen,
    uciHistory: (rawMoveHistory.get(gameID) ?? []).map(rawMoveToUci),
    fenHistory: rawFenHistory.get(gameID) ?? [],
    headers: {},
  }).pgn;
}

/**This function is used to create make move */
export async function makeMove(
  gameID: string, candidates: string[], seq?: number, moveType?: string, boardType?: string, fen?: string
): Promise<MoveState> {
  const isMoveError = moveType === MOVE_TYPE.MOVE_ERROR;
  if (!candidates?.length && !isMoveError) {
    return { status: ERROR_STATUS.INVALID, gameID };
  }

  if (!games.has(gameID)) {
    const restored = await restorefromDB(gameID);
    if (!restored) return { status: ERROR_STATUS.NOTFOUND };
  }

  const mainGame = games.get(gameID);
  const effectiveSeq = seq ?? (gameSeq.get(gameID) ?? 0) + 1;
  const normalizedBoardType = boardType?.toUpperCase() ?? BOARD_TYPE.HALL;

  if (normalizedBoardType === BOARD_TYPE.HALL) {
    if (activeBranches.has(gameID)) { // Resolve branches
      return handleBranchMove(gameID, mainGame, candidates, effectiveSeq, moveType ?? "");
    }

    if (moveType === MOVE_TYPE.CAPTURE) {
      return handleNewCaptureMove(gameID, mainGame, candidates, effectiveSeq);
    }

    if (moveType === MOVE_TYPE.MOVE_ERROR) {
      return handleErrorMove(gameID, mainGame, candidates, effectiveSeq);
    }

    // another moveType
    return handleNewNormalMove(gameID, mainGame, candidates, effectiveSeq);
  } else if (normalizedBoardType === BOARD_TYPE.NFC) {
    gameSeq.set(gameID, effectiveSeq);

    if (moveType === MOVE_TYPE.MOVE_ERROR) {
      // Save engine state BEFORE loading the board FEN so we can
      // infer what move was actually played (if any).
      const engineFenBefore = mainGame.fen();
      // Capture the pre-move position before replacing the runtime board
      // with the incoming ESP32 snapshot. It is required for FEN-to-move
      // inference and for placing the first live PGN move in the right turn.
      ensureRawHistory(gameID, mainGame);
      const newFen = fen ?? engineFenBefore;
      try {
        mainGame.load(newFen, { skipValidation: true });
      } catch (e) {
        console.error("[MOVE_ERROR] Failed to load fen:", newFen, e);
      }

      // Try to infer the move from the FEN transition. An unresolved board
      // change is retained as an X marker rather than being silently lost.
      const inferred = inferMoveFromFen(engineFenBefore, newFen);
      if (inferred && inferred.from && inferred.to) {
        console.log(`[MOVE_ERROR] Inferred move from FEN diff: ${inferred.from}→${inferred.to}`);
        rawMoveHistory.get(gameID)!.push({
          from: inferred.from as Square,
          to: inferred.to as Square,
          promotion: inferred.promotion as PieceSymbol | undefined,
        });
      } else {
        rawMoveHistory.get(gameID)!.push({ from: "--" as Square, to: "--" as Square });
      }

      rawFenHistory.get(gameID)!.push(newFen);
      const freshPgn = buildLiveBoardPgn(gameID, engineFenBefore);

      return {
        status: MOVE_STATUS.OK,
        gameID,
        fen: newFen,
        pgn: freshPgn,
        lastSeq: effectiveSeq,
        lastMove: null,
        isError: true,
      } as MoveState
    }
    return handleNFCMove(gameID, mainGame, candidates, effectiveSeq, fen);
  }

  return { status: ERROR_STATUS.INVALID };
}

// This function is used to for NFC
function handleNFCMove(gameID: string, mainGame: Chess, candidates: string[], seq: number, fen?: string): MoveState {
  const uci = candidates[0];
  const hasValidUci = !!(uci && uci.length >= 4);

  if (hasValidUci) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;

    ensureRawHistory(gameID, mainGame);

    if (fen) {
      // The board provided the complete position. Load it for in-memory
      // calculations only; never rewrite any FEN field from the payload.
      // In particular, the active-color field is owned by the board clock.
      // The UCI describes what was played, so do not apply it a second time.
      try {
        mainGame.load(fen, { skipValidation: true });
      } catch (e) {
        console.error("[NFC MOVE] Failed to load fen:", fen, e);
      }
    } else {
      // No FEN — apply the UCI to the current engine position.
      const result = applyRawMove(mainGame, from as Square, to as Square, promotion as PieceSymbol);
      if (!result) {
        console.log(`[NFC MOVE] No piece at ${from}, ignoring`);
        gameSeq.set(gameID, seq);
        return buildResponse(gameID, mainGame, seq, { invalidMove: true });
      }
    }

    // Always record the UCI for PGN generation
    rawMoveHistory.get(gameID)!.push({ from: from as Square, to: to as Square, promotion: promotion as PieceSymbol });
    // Preserve the exact snapshot received from the board. Do not replace it
    // with chess.js' normalized FEN, which can change counters/turn fields.
    if (fen) rawFenHistory.get(gameID)!.push(fen);
    else rawFenHistory.get(gameID)!.push(mainGame.fen());

    const customPgn = buildLiveBoardPgn(gameID, mainGame.fen());
    gameSeq.set(gameID, seq);

    return {
      status: MOVE_STATUS.OK,
      gameID,
      fen: fen ?? mainGame.fen(),
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

  // UCI is invalid or too short — but we may still have a FEN from the board.
  // Try to infer the move by diffing the engine's current FEN vs the incoming FEN.
  if (fen) {
    const engineFenBefore = mainGame.fen();
    // Keep the pre-move FEN as the history base. Calling this after load()
    // makes the first FEN appear to be the starting position and prevents
    // a useful FEN diff from being built.
    ensureRawHistory(gameID, mainGame);
    try {
      mainGame.load(fen, { skipValidation: true });
    } catch (e) {
      console.error("[NFC MOVE] Failed to load fen:", fen, e);
    }

    // Try to infer the move from FEN diff
    const inferred = inferMoveFromFen(engineFenBefore, fen);
    if (inferred && inferred.from && inferred.to) {
      console.log(`[NFC MOVE] Inferred move from FEN diff: ${inferred.from}→${inferred.to}`);
      rawMoveHistory.get(gameID)!.push({
        from: inferred.from as Square,
        to: inferred.to as Square,
        promotion: inferred.promotion as PieceSymbol | undefined,
      });
    } else {
      // Cannot infer — push placeholder so PGN shows something
      console.log(`[NFC MOVE] Cannot infer move from FEN diff, pushing placeholder`);
      rawMoveHistory.get(gameID)!.push({
        from: "--" as Square,
        to: "--" as Square,
      });
    }

    // Keep the incoming snapshot unchanged in the durable raw history.
    rawFenHistory.get(gameID)!.push(fen);

    const customPgn = buildLiveBoardPgn(gameID, engineFenBefore);
    gameSeq.set(gameID, seq);

    return {
      status: MOVE_STATUS.OK,
      gameID,
      fen,
      pgn: customPgn,
      lastSeq: seq,
      lastMove: null,
    };
  }

  console.log(`[NFC MOVE] Invalid uci format: ${uci} and no FEN provided, ignoring`);
  gameSeq.set(gameID, seq);
  return buildResponse(gameID, mainGame, seq, { invalidMove: true });
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
  const inMemoryGame = games.get(gameID);
  if (inMemoryGame) {
    return {
      gameID,
      fen: inMemoryGame.fen(),
      lastMove: null
    };
  }

  // A Socket.IO snapshot request must not turn an arbitrary historical game
  // into a permanent in-memory session. Build a short-lived Chess instance
  // from MongoDB instead; moves can still restore an active session normally.
  const data = await getGame(gameID);
  if (!data) return null;
  const game = new Chess();
  if (data.fen) {
    try {
      game.load(data.fen, { skipValidation: true });
    } catch {
      if (data.pgn) game.loadPgn(data.pgn);
    }
  } else if (data.pgn) {
    game.loadPgn(data.pgn);
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
  rawFenHistory.delete(gameID);
  pgnBaseFen.delete(gameID);
  return game
}

/**This function is used to destroy board */
export function destroyBoard(gameID: string): void {
  // Xóa hoàn toàn khỏi RAM thay vì tạo Chess object thừa
  games.delete(gameID);
  gameSeq.delete(gameID);
  activeBranches.delete(gameID);
  rawMoveHistory.delete(gameID);
  rawFenHistory.delete(gameID);
  pgnBaseFen.delete(gameID);
}

// Map boarid to gameid
export function setCurrentGame(boardID: string, gameID: string): void {
  // clean up old game
  const oldGameID = currentGameByBoard.get(boardID);
  if (oldGameID && oldGameID !== gameID) {
    boardIDByGame.delete(oldGameID);
  }

  currentGameByBoard.set(boardID, gameID);
  boardIDByGame.set(gameID, boardID);

}

// Get gameID from boardID
export function getCurrentGame(boardID: string): string | undefined {
  return currentGameByBoard.get(boardID);
}

/** Resolves a board session from MongoDB if its runtime mapping was lost. */
export async function getOrRestoreCurrentGame(boardID: string): Promise<string | undefined> {
  const inMemoryGameID = getCurrentGame(boardID);
  if (inMemoryGameID) return inMemoryGameID;

  const persistedGame = await getLatestGameByBoardID(boardID);
  if (!persistedGame?.gameID) return undefined;

  setCurrentGame(boardID, persistedGame.gameID);
  const restored = await restorefromDB(persistedGame.gameID);
  if (!restored) {
    removeCurrenGame(boardID);
    return undefined;
  }

  console.log(`Restored board ${boardID} to game ${persistedGame.gameID} from MongoDB`);
  return persistedGame.gameID;
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
