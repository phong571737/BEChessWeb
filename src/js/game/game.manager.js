import { Chess } from "chess.js";
import { loadGame } from "../models/game.model.js";
import { getIO, pendingPromotions } from "../sockets/index.js";

export const games = new Map();
export const gameSeq = new Map();

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

export async function makeMove(gameID, uci, seq) {
  if (!games.has(gameID)) {
    const restored = await restorefromDB(gameID);
    if (!restored){
      return {status: "not_found"}
    }
  }

  const game = games.get(gameID);
  const lastSeq = gameSeq.get(gameID) ?? 0;
  const expectedSeq = lastSeq + 1;
  
  if (!uci || seq === undefined) {
    return { status: "invalid_request"}
  }

  //duplicated
  if (seq < expectedSeq) {
    return {
      status: "duplicate",
      fen: game.fen(),
      lastSeq,
    }
  }

  //Out of order
  if (seq > expectedSeq) {
    return{
      status: "out_of_order",
      expectedSeq,
      lastSeq
    }
  }

  const from = uci.slice(0, 2); // start
  const to = uci.slice(2, 4); // end
  const promotion = uci.length === 5 ? uci[4] : "q";

  let move;
  try{
    move = game.move({
      from,
      to,
      promotion: promotion
    })
  }catch(e){
    return {
      status: "illegal",
      lastSeq,
    }
  }

  gameSeq.set(gameID, seq);

  return {
    status: "ok",
    gameID,
    fen: game.fen(),
    pgn: game.pgn(),
    lastSeq: seq,
    lastMove: { from, to, uci }
  }
}

export function createGame(gameID) {
  if (games.has(gameID)) { // if the game is exists
    return games.get(gameID);
  }

  const game = new Chess();
  games.set(gameID, game);
  return game;
}

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
  if(!games.has(gameID)){
    games.set(gameID, new Chess());
  }

  const game = games.get(gameID);
  if(!game) 
    throw new Error("Game not found");
  game.reset();
  gameSeq.set(gameID, 0);
  return game
}

/**This function is used to destroy board */
export function destroyBoard(gameID){
  if(!games.has(gameID)){
    games.set(gameID, new Chess());
  }

  const game = games.get(gameID);
  game.destroy();
}

/**This function wait for client choose piece*/
export function askPromotion(gameID, to){
  return new Promise((resolve) => {
    const io = getIO();
    console.log("Emitting promotion_required for:", gameID);
    // require webserver
    io.to(gameID).emit("promotion_required", {gameID, to});
    
    // Wait for webserver
    pendingPromotions.set(gameID, resolve);

    // 30s default queen
    // setTimeout(() => {
    //   if (pendingPromotions.has(gameID)){
    //     pendingPromotions.delete(gameID);
    //     resolve("q")
    //   }
    // }, 30000);
  });
}