import { getGameCollections } from "../models/gameModels.js";

export async function LoadGameFromDB() {
  const games = getGameCollections();
  const data = await games.findOne({_id: "current_game"});

  return data;
}