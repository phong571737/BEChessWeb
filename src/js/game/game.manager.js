import {Chess} from "chess.js";
import { loadGame } from "../models/gameModels.js";
import expressListEndpoints from "express-list-endpoints";

const games = new Map();
const gameSeq = new Map();

export async function restorefromDB(gameID){
  const data = await loadGame(gameID);
  if(!data) return null;

  const game = new Chess();
  if(data.pgn) {
    game.loadPgn(data.pgn);
  }else if(data.fen){
    game.load(data.fen);
  }

  games.set(gameID, game);
  gameSeq.set(gameID, data.lastSeq ?? 0);
  console.log(`Restored game ${gameID} from DB`);
  return game;
}

export async function makeMove(gameID, uci, seq){
  if(!games.has(gameID)){
    const restored = await restorefromDB(gameID);
    if(!restored) throw new Error("Game not found");
  }

  const game = games.get(gameID);
  if(!game){
    throw new Error("Game not found");
  }

  if(!uci || seq === undefined){
    throw new Error("UCI or Seq is required");
  }

  const lastSeq = gameSeq.get(gameID) ?? 0;
  const expectedSeq = lastSeq + 1;

  //Check order
  if(seq < expectedSeq){
    return{
      duplicate: true,
      fen: game.fen(),
      lastSeq,
    }
  }

  if(seq > expectedSeq){
    throw new Error(`Out of order expected ${expectedSeq}`);
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

  gameSeq.set(gameID, seq);

   const state = {
    gameID,
    fen: game.fen(),
    pgn: game.pgn(),
    lastSeq: seq,
    lastMove: { from, to, uci}
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
