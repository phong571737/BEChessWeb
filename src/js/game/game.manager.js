import { Chess } from "chess.js";
import { loadGame } from "../models/game.model.js";
import { getIO, pendingPromotions } from "../sockets/index.js";

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
  if (!games.has(gameID)) {
    const restored = await restorefromDB(gameID);
    if (!restored) 
      return { status: "not_found" };
    games.set(gameID, restored);
  }

  let mainGame = games.get(gameID);
  const lastSeq = gameSeq.get(gameID) ?? 0;
  const expectedSeq = lastSeq + 1;

  if (!candidates || candidates.length === 0 || seq === undefined) {
    return { status: "invalid_request" }
  }
  //duplicated
  if (seq < expectedSeq) return { status: "duplicate", fen: mainGame.fen(), lastSeq};
  //Out of order
  if (seq > expectedSeq) return { status: "out_of_order", expectedSeq, lastSeq };

  let isCorrection = false;
  let correctionPGN = "";

  if (activeBranches.has(gameID)) {
    console.log(`Resolving branches for game ${gameID}`);
    const branches = activeBranches.get(gameID);
    let survivingBranches = [];

    const currentMoveUci = candidates[candidates.length - 1];
    const from = currentMoveUci.slice(0, 2);
    const to = currentMoveUci.slice(2, 4);
    const promotion = currentMoveUci.length === 5 ? currentMoveUci[4] : undefined;

    // Test this move in all of branch is saving
    for (let branch of branches) {
      try {
        // Create duplicate
        const tempClone = new Chess();
        tempClone.loadPgn(branch.game.pgn());

        const moveResult = tempClone.move({from, to, promotion});
        if (moveResult) {
          survivingBranches.push(branch);
        }
      } catch (e) {

      }
    }

    if (survivingBranches.length === 1) {
      // Main branch
      const trueBranch = survivingBranches[0];

      if (trueBranch.id != branches[0].id) {
        isCorrection = true;
        correctionPGN = trueBranch.game.pgn();
      }

      // update main into standard branch
      mainGame.loadPgn(trueBranch.game.pgn());
      activeBranches.delete(gameID); // remove the wrong branch 
    }
    else if (survivingBranches.length > 1) {
      // new move ligellal at least 2 branch
      activeBranches.set(gameID, survivingBranches);
      // get the first branch to make maingame
      mainGame.loadPgn(survivingBranches[0].game.pgn());
    }
    else {
      return {
        status: "illegal",
        lastSeq
      }
    }
  }

  // find all moves illegal for current candidate
  let validMoves = [];
  const reversedCandidates = [...candidates].reverse();

  for (let uci of reversedCandidates) {
    const from = uci.slice(0, 2); // start
    const to = uci.slice(2, 4); // end
    const piece = mainGame?.get(from);

    const isPromotion = piece?.type === "p" && (
      (piece.color === "w" && to[1] === "8") ||
      (piece.color === "b" && to[1] === "1")
    );
    const promotionChar = uci.length === 5 ? uci[4] : (isPromotion ? "q" : undefined);
  
    try {
      const move = mainGame.move({ from, to, promotion: promotionChar});
      if (move) {
        validMoves.push({from, to, uci: from + to + (promotionChar || "")});
        mainGame.undo();
      }
    } catch (e) {
      console.log(`[Engine] Candidate ${uci} is illegal, trying next...`);
      continue;
    }
  }

  if (validMoves.length === 0)  return { status: "illegal", lastSeq,};
  if (validMoves.length > 1) {
    let newBranches = [];

    for (let i = 0 ;i < validMoves.length; i++ ) {
      const clone = new Chess();
      clone.loadPgn(mainGame.pgn());
      clone.move({from: validMoves[i].from, to: validMoves[i].to, promotion: validMoves[i].uci[4]});

      newBranches.push({
        id: `branch_${i}`,
        move: validMoves[i],
        game: clone
      });
    }
    activeBranches.set(gameID, newBranches);
    mainGame.loadPgn(newBranches[0].game.pgn());
  }else {
    mainGame.move({from: validMoves[0].from, to: validMoves[0].to, promotion: validMoves[0].uci[4]});
  }

  gameSeq.set(gameID, seq);

  return {
    status: "ok",
    gameID,
    fen: mainGame.fen(),
    pgn: mainGame.pgn(),
    lastSeq: seq,
    lastMove: validMoves[0],
    isCorrection: isCorrection,
    correctionPGN: correctionPGN
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
export function getCurrentState(gameID) {
  const game = games.get(gameID);
  if (!game) return null;

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