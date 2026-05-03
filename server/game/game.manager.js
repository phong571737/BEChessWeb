import { Chess } from "chess.js";
import { loadGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";
import { ChessService } from "../services/chess.service.js";

export const games = new Map();
export const gameSeq = new Map();
export const activeBranches = new Map();
export const lastAccessed = new Map();

const EVICTION_TIMEOUT = 30 * 60 * 1000;

export function evictStaleGames() {
  const now = Date.now();
  for (const [gameID, lastAccess] of lastAccessed) {
    if (now - lastAccess > EVICTION_TIMEOUT) {
      games.delete(gameID);
      gameSeq.delete(gameID);
      activeBranches.delete(gameID);
      lastAccessed.delete(gameID);
    }
  }
}

export function updateLastAccess(gameID) {
  lastAccessed.set(gameID, Date.now());
}

export async function restorefromDB(gameID) {
  const data = await loadGame(gameID);
  if (!data) return null;

  const game = new Chess();
  if (data.pgn) {
    game.loadPgn(data.pgn);
  } else if (data.fen) {
    game.load(data.fen);
  }

  games.set(gameID, game);
  gameSeq.set(gameID, data.lastSeq ?? 0);
  updateLastAccess(gameID);
  return game;
}

/**This function is used to create make move */
export async function makeMove(gameID, candidates, seq) {
  evictStaleGames();
  if (!candidates?.length || seq === undefined) {
    return { status: "invalid_request" }
  }

  if (!games.has(gameID)) {
    const restored = await restorefromDB(gameID);
    if (!restored) return { status: "not_found" };
    updateLastAccess(gameID);
    // games.set(gameID, restored);
  }

  const mainGame = games.get(gameID);
  const lastSeq = gameSeq.get(gameID) ?? 0;
  const expectedSeq = lastSeq + 1;

  //duplicated
  if (seq < expectedSeq) return { status: "duplicate", fen: mainGame.fen(), lastSeq };
  //Out of order
  if (seq > expectedSeq) return { status: "out_of_order", expectedSeq, lastSeq };

  // Resolve branches if ambiguity
  if (activeBranches.has(gameID)) {
    console.log(`Resolving branches for game ${gameID}`);
    const result = resolveBranches(gameID, mainGame, candidates);
    if (result.status !== "ok") return { ...result, lastSeq };

    //branch move cosumed successfully
    gameSeq.set(gameID, seq);

    return {
      status: "ok",
      gameID,
      fen: mainGame.fen(),
      pgn: mainGame.pgn(),
      lastSeq: seq,
      isCorrection: result.isCorrection,
      correctionPGN: result.correctionPGN,
      lastMove: result.lastMove
    }
  }
  
  // find all moves illegal for current candidate
  let validMoves = ChessService.findValidMove(mainGame, candidates);
  if (validMoves.length === 0) return { status: "illegal", lastSeq };

  if (validMoves.length > 1) {
    // create branches when moves valid
    const branches = validMoves.map((mv, i) => {
      const clone = new Chess();
      clone.loadPgn(mainGame.pgn());
      clone.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
      return { id: `branch_${i}`, move: mv, fen: clone.fen(), pgn: clone.pgn(), lastApplied: mv };
    });

    activeBranches.set(gameID, branches);
    mainGame.loadPgn(branches[0].pgn);
    gameSeq.set(gameID, seq);

    return {
      status: "ok",
      gameID,
      fen: mainGame.fen(),
      pgn: mainGame.pgn(),
      lastSeq: seq,
      ambiguity: true,
      branches: branches.length,
      lastMove: branches[0].lastApplied
    };
  }

  const mv = validMoves[0];
  mainGame.move({
    from: mv.from,
    to: mv.to,
    promotion: mv.promotion
  });

  gameSeq.set(gameID, seq);

  return {
    status: "ok",
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

// This function is resolve ambiguous branches with the lastest move
export function resolveBranches(gameID, mainGame, candidates) {
  const branches = activeBranches.get(gameID);
  const surviving = []; // array to save candidates validation
  // const lastUCI = candidates[candidates.length - 1];

  // Loop through all of branches
  for (const branch of branches) {
    let survived = false;

    // Loop through all of candidates
    for (const uci of candidates) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length === 5 ? uci[4] : undefined;

      try {
        const temp = new Chess();
        temp.loadPgn(branch.pgn);

        const result = temp.move({ from, to, promotion });

        if (result) {
          surviving.push({
            ...branch,
            pgn: temp.pgn(),
            fen: temp.fen(),
            lastApplied: {
              from,
              to,
              promotion,
              uci: from + to + (promotion ?? "")
            }
          });
          survived = true;
          break;
        }
      } catch { }
    }

    // branch illegal => remove
    if (!survived) {
      console.log(`Branch ${branch.id} eliminated`);
    }
  }

  if (surviving.length === 0) return { status: "illegal" };
  const isCorrection = surviving.length === 1 && surviving[0].id !== branches[0].id;

  mainGame.loadPgn(surviving[0].pgn);

  if (surviving.length === 1) {
    activeBranches.delete(gameID); // remove the wrong branch 
    console.log(`Resolved to ${surviving[0].id}`);
  }
  else {
    activeBranches.set(gameID, surviving);
    console.log(`${surviving.length} branches remain`);
  }

  return {
    status: "ok",
    isCorrection,
    correctionPGN: isCorrection ? surviving[0].pgn : "",
    lastMove: surviving[0].lastApplied,
  };
}

/**This function is used to create game  */
export function createGame(gameID) {
  if (games.has(gameID)) {
    updateLastAccess(gameID);
    return games.get(gameID);
  }

  const game = new Chess();
  games.set(gameID, game);
  updateLastAccess(gameID);
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
  updateLastAccess(gameID);
  const seq = gameSeq.get(gameID) ?? game.history().length ?? 0;
  const verboseHistory = game.history({ verbose: true });
  const last = verboseHistory.at(-1);

  return {
    gameID,
    fen: game.fen(),
    lastMove: last ? {
      from: last.from,
      to: last.to,
      promotion: last.promotion ?? null,
      uci: `${last.from}${last.to}${last.promotion ?? ""}`,
    } : null,
    lastSeq: seq,
  };
}

export function loadPGN(gameID, pgn) {
  const game = games.get(gameID);
  if (!game) throw new Error("Game not found");

  game.loadPgn(pgn);
  updateLastAccess(gameID);
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
  updateLastAccess(gameID);
  return game
}

/**This function is used to destroy board and clean up RAM state */
export function destroyBoard(gameID) {
  games.delete(gameID);
  gameSeq.delete(gameID);
  activeBranches.delete(gameID);
  lastAccessed.delete(gameID);
}
