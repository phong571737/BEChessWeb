import { Chess } from "chess.js";
import { getGameCollections } from "../models/game.model.js";

export async function LoadGameFromDB() {
  const games = getGameCollections();
  const data = await games.findOne({_id: "current_game"});

  return data;
}

// This function is used to clone fen state
export function cloneFromFen(fen) {
  return new Chess(fen);
}

// This function is used to apply a move
export function applyMove(game, from, to, promotion) {
  try {
    const result = game.move({from, to, promotion});
    return result;
  } catch {
    return null;
  }
}

// this function is used to find all of moves validation
export function findValidMove(game, candidates) {
  const valid = [];
  const seen = new Set();

  for(const uci of [...candidates].reverse()) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const key = from + to;

    if(seen.has(key)) continue; // if key is in seen => skip

    const piece = game.get(from);
    const isPromotion = piece?.type === "p" && 
      ((piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1"));
    
    const promotion = uci[4] ?? (isPromotion ? "q" : undefined);

    try {
      const result = game.move({from, to, promotion});
      if (result) {
        game.undo();
        valid.push({from, to, promotion, uci: from + to + (promotion ?? "")});
        seen.add(key);
      }
    }
    catch {}
  }

  return valid;
}



