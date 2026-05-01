import { getDB } from "../config/database.js";

const pgnGames = () => getDB().collection("pgn_games");

export function getPGNCollections(){return pgnGames();}
/**
 * This function is used to save pgn into database
 * when the game ended */
export async function endGame(doc) {
    return getPGNCollections().insertOne(doc); 
}