import {Chess} from "chess.js";

// const game = new Chess();
const games = new Map();

export function makeMove(gameID, uci){
  const game = games.get(gameID);
  if(!game){
    throw new Error("Game not found");
  }

  if(!uci){
    throw new Error("UCI is required");
  }

  const from = uci.slice(0, 2); // start
  const to = uci.slice(2, 4); // end

  const move = game.move({
    from, 
    to, 
    promotion: "q"
  })

  if(!move){
    throw new Error("Illegal move");
  }

   const state = {
    gameID,
    fen: game.fen(),
    lastMove: {
      from,
      to,
      uci
    }
  }
  return state;
}

export function createGame(gameID){
  if(games.has(gameID)){ // if the game is exists
    return games.get(gameID);
  }

  const game = new Chess();
  games.set(gameID, game);
  return game;
}

export function getCurrentState(gameID){
  const game = games.get(gameID);
  console.log("All games:", [...games.keys()])
  if(!game) return null;

  return {
    gameID,
    fen: game.fen(),
    lastMove: null
  };
}

export function loadPGN(gameID, pgn){
  const game = games.get(gameID);
  if(!game) throw new Error("Game not found");

  game.loadPgn(pgn);
}
