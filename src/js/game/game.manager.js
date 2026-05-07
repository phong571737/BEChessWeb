import { Chess } from "chess.js";
import { loadGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";
import { ChessService } from "../services/chess.service.js";
import { DUPLICATE, ILLEGAL_MOVE, INVALID_STATUS, NOTFOUND_STATUS, OUT_OF_SEQ, STATUS_OK } from "../constant.js";
import { buildResponse, executeMove, formatUCI, parseUCI } from "../utils/chess.utils.js";
import { createBranches } from "../services/game.service.js";

export const games = new Map();
export const gameSeq = new Map();
export const activeBranches = new Map();

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
  return game;
}

/**This function is used to create make move */
export async function makeMove(gameID, candidates, seq) {
  if (!candidates?.length || seq === undefined) {
    return { status: INVALID_STATUS }
  }

  if (!games.has(gameID)) {
    const restored = await restorefromDB(gameID);
    if (!restored) return { status: NOTFOUND_STATUS };
  }

  const mainGame = games.get(gameID);
  const lastSeq = gameSeq.get(gameID) ?? 0;

  const expectedSeq = lastSeq + 1;

  //duplicated
  if (seq < expectedSeq) return { status: DUPLICATE, fen: mainGame.fen(), lastSeq };
  //Out of order
  if (seq > expectedSeq) return { status: OUT_OF_SEQ, expectedSeq, lastSeq };

  // Resolve branches if multimove 
  if (activeBranches.has(gameID)) {
    console.log(`Resolving branches for game ${gameID}`);
    const result = resolveBranches(gameID, mainGame, candidates);
    // resolve
    if (result.resolved ) {
      //branch move cosumed successfully
      gameSeq.set(gameID, seq);

      return buildResponse(gameID, mainGame, seq, {
        lastMove: result.lastMove
      });
    }

    return buildResponse(gameID, mainGame, seq, {
      ambiguity: result.ambiguity,
      branches: result.branches,
      lastMove: result.lastMove
    })
  }

  // find all moves llegal for current candidate
  let validMoves = ChessService.findValidMove(mainGame, candidates);
  if (validMoves.length === 0) return { status: ILLEGAL_MOVE, lastSeq };

  if (validMoves.length > 1) {
    // create branches when moves valid
    const branches = createBranches(mainGame, validMoves);

    activeBranches.set(gameID, branches);
    printBranches(gameID);

    gameSeq.set(gameID, seq);

    return buildResponse(gameID, mainGame, seq, {
      ambiguity: true,
      branches: branches.length,
      lastMove: branches[0].lastApplied
    })
  }

  const mv = validMoves[0];
  executeMove(mainGame, mv);

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
  const branches = activeBranches.get(gameID) || [];
  const nextBranches = []; // loop all branch

  // Loop through all of branches
  for (const branch of branches) {
    let match = false; // flag to check wheather branch valid or not

    // Loop through all of candidates
    for (const uci of candidates) {
      const move = parseUCI(uci)

      try {
        const temp = new Chess();
        temp.loadPgn(branch.pgn);

        // if branch match, continue
        if (temp.move(move)) {
          nextBranches.push({
            ...branch,
            pgn: temp.pgn(),
            fen: temp.fen(),
            lastApplied: {
              ...move,
              uci: formatUCI(move.from, move.to, move.promotion)
            },
            step: branch.step + 1
          });
          match = true;
          // break;
        }
      } catch { }
    }

    // branch illegal (hold, not remove)
    // if (!match) {
    //   nextBranches.push(branch);
    // }
  }

  // update branch 
  activeBranches.set(gameID, nextBranches);
  printBranches(gameID);

  // Commit when just one branch valid
  if (nextBranches.length === 1) {
    const finalBranch = nextBranches[0];

    mainGame.loadPgn(finalBranch.pgn);
    activeBranches.delete(gameID);

    return {
      status: STATUS_OK,
      resolved: true,
      fen: mainGame.fen(),
      pgn: mainGame.pgn(),
      lastMove: finalBranch.lastApplied,
    };
  }

  // ambigous
  return {
    ambiguity: true,
    branches: nextBranches.length,
    lastMove: nextBranches.find(b => b.lastApplied)?.lastApplied ?? null
  };
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



// debug
export function printBranches(gameID) {
  const branches = activeBranches.get(gameID);

  if (!branches) {
    console.log(`[BRANCH] ${gameID}: no active branches`);
    return;
  }

  console.log(`\n========== BRANCH DUMP (${gameID}) ==========`);

  branches.forEach((b, i) => {
    console.log(`\n[BRANCH ${i}]`);
    console.log(`step:`, b.step);
    console.log(`fen:`, b.fen);
    console.log(`lastApplied:`, b.lastApplied);
    console.log(`uci:`, b.lastApplied?.uci);
    console.log(`pgn:\n${b.pgn}`);
  });

  console.log(`\nTotal branches: ${branches.length}`);
  console.log(`===========================================\n`);
}