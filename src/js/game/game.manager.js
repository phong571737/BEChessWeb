import { Chess } from "chess.js";
import { getGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";
import { ChessService } from "../services/chess.service.js";
import { buildResponse, executeMove, formatUCI, parseUCI } from "../utils/chess.utils.js";
import { createBranches } from "../services/game.service.js";
import { ERROR_STATUS, MOVE_STATUS, MOVE_TYPE } from "../constant.js";
import { games, gameSeq, activeBranches, currentGameByBoard } from "./game.repository.js";
import { printBranches } from "../utils/debug.branch.js";

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
    console.log(`Resolving branches for game ${gameID}`);

    const currentBranches = activeBranches.get(gameID); // get branch that current
    // find all moves llegal for current candidate
    let validMoves = ChessService.findValidMove(mainGame, candidates);
    console.log(`valid move from: ${validMoves}`);

    if (moveType !== MOVE_TYPE.CAPTURE) {
      const nextBranches = [];

      for (const branch of currentBranches) {
        const tempGame = new Chess();
        tempGame.loadPgn(branch.pgn);

        const branchValidMoves = ChessService.findValidMove(tempGame, candidates);

        if (branchValidMoves.length === 1) {
          const clone = new Chess();
          clone.loadPgn(branch.pgn);
          executeMove(clone, branchValidMoves[0]);

          nextBranches.push({
            ...branch,
            pgn: clone.pgn(),
            fen: clone.fen(),
            lastApplied: branchValidMoves[0],
            step: branch.step + 1,
          });
        } else {
          // hold branch
          nextBranches.push(branch);
        }
      }

      // Dedup theo fen
      const seen = new Set();
      const dedupedBranches = nextBranches.filter(b => {
        if (seen.has(b.fen)) return false;
        seen.add(b.fen);
        return true;
      });

      gameSeq.set(gameID, seq);

      // Resolve nếu còn 1 branch
      if (dedupedBranches.length === 1) {
        const finalBranch = dedupedBranches[0];
        mainGame.loadPgn(finalBranch.pgn);
        activeBranches.delete(gameID);
        games.set(gameID, mainGame);

        return buildResponse(gameID, mainGame, seq, {
          lastMove: finalBranch.lastApplied,
        });
      }

      activeBranches.set(gameID, dedupedBranches);
      printBranches(gameID);

      return buildResponse(gameID, mainGame, seq, {
        ambiguity: true,
        branches: dedupedBranches.length,
        lastMove: dedupedBranches[0]?.lastApplied ?? null,
      });
    }

    // expand branches (illegal or ambigous)
    if (validMoves.length != 1) {
      const expandBranches = [];
      const fromSq = candidates[0]?.slice(0, 2);
      const isIllegal = validMoves.length === 0;

      // loop for all current branch
      for (const branch of currentBranches) {
        const tempGame = new Chess();
        tempGame.loadPgn(branch.pgn);

        let validCandidates = candidates;

        if (isIllegal && fromSq) {
          if (moveType === MOVE_TYPE.CAPTURE) {
            validCandidates = tempGame.moves({ square: fromSq, verbose: true })
              .filter(m => m.flags.includes('c') || m.flags.includes('e'))
              .map(m => m.from + m.to);
          } else {
            // validCandidates = candidates;
            validCandidates = tempGame
              .moves({ square: fromSq, verbose: true })
              .map(m => m.from + m.to);
          }
        }

        // find all the validated moves from new move
        const branchvalidMoves = ChessService.findValidMove(tempGame, validCandidates);

        if (branchvalidMoves.length === 1) {
          // just have 1 valid move
          const clone = new Chess();
          clone.loadPgn(branch.pgn);
          executeMove(clone, branchvalidMoves[0]);

          expandBranches.push({
            ...branch,
            pgn: clone.pgn(),
            fen: clone.fen(),
            lastApplied: branchvalidMoves[0],
            step: branch.step + 1,
          });
        }
        else if (branchvalidMoves.length > 1) { // There are many valid moves
          for (const mv of branchvalidMoves) {
            const clone = new Chess();
            clone.loadPgn(branch.pgn);
            executeMove(clone, mv);

            expandBranches.push({
              ...branch,
              id: `${branch.id}_${mv.from}${mv.to}`,
              pgn: clone.pgn(),
              fen: clone.fen(),
              lastApplied: mv,
              step: branch.step + 1,
            });
          }
        }
        else {
          //validMoves = 0, create from dep square
          // const fromSq = candidates[0]?.slice(0, 2);
          // const movesFromSq = fromSq
          //   ? tempGame.moves({square: fromSq, verbose: true})
          //   : [];

          // for (const mv of movesFromSq) {
          //   const clone = new Chess();
          //   clone.loadPgn(branch.pgn);
          //   executeMove(clone, mv);

          //   expandBranches.push({
          //     ...branch,
          //     id: `${branch.id}_ill_${mv.from}${mv.to}`,
          //     pgn: clone.pgn(),
          //     fen: clone.fen(),
          //     lastApplied: mv,
          //     fromIllegal: true,
          //     step: branch.step + 1,
          //   });
          // }
          // // Hold root branch, don't remove
          // expandBranches.push(branch);
          console.log(`Branch ${branch.id} eliminated`);
        }
      }

      const seen = new Set();
      const dedupedBranches = expandBranches.filter(b => {
        if (seen.has(b.fen)) return false;
        seen.add(b.fen);
        return true;
      });

      // 1 branch => resolve 
      if (dedupedBranches.length === 1) {
        const finalBranch = dedupedBranches[0];
        mainGame.loadPgn(finalBranch.pgn);
        activeBranches.delete(gameID);
        gameSeq.set(gameID, seq);
        return buildResponse(gameID, mainGame, seq, {
          lastMove: finalBranch.lastApplied,
        });
      }

      activeBranches.set(gameID, dedupedBranches);
      printBranches(gameID);
      gameSeq.set(gameID, seq);

      return buildResponse(gameID, mainGame, seq, {
        ambiguity: true,
        branches: expandBranches.length,
        lastMove: expandBranches[0]?.lastApplied ?? null,
      });
    }

    // validMoves === 1, resolve
    const result = resolveBranches(gameID, mainGame, candidates);
    //branch move cosumed successfully
    gameSeq.set(gameID, seq);

    // resolve
    if (result.resolved) {
      const resolvedGame = new Chess();
      resolvedGame.loadPgn(result.pgn);
      games.set(gameID, resolvedGame);
      activeBranches.delete(gameID);

      return buildResponse(gameID, resolvedGame, seq, {
        lastMove: result.lastMove,
        resolvedMove: result.resolvedMove,
      });
    }

    return buildResponse(gameID, mainGame, seq, {
      ambiguity: result.ambiguity,
      branches: result.branches,
      lastMove: result.lastMove
    });
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
            branchMove: branch.lastApplied,
            lastApplied: {
              ...move,
              uci: formatUCI(move.from, move.to, move.promotion)
            },
            step: branch.step + 1
          });
          match = true;
          break;
        }
      } catch { }
    }

    // branch illegal (hold, not remove)
    if (!match) {
      nextBranches.push(branch);
    }
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
      status: MOVE_STATUS.OK,
      resolved: true,
      fen: mainGame.fen(),
      pgn: mainGame.pgn(),
      lastMove: finalBranch.lastApplied,
      resolvedMove: finalBranch.branchMove,
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