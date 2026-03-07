import { getGameCollections } from "../models/game.model.js";

export async function LoadGameFromDB() {
  const games = getGameCollections();
  const data = await games.findOne({_id: "current_game"});

  return data;
}

