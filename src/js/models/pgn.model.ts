import { getDB } from "../config/database.js";
import { Collection, Document, InsertOneResult } from "mongodb";

const pgnGames = (): Collection<Document> => getDB().collection<Document>("game_history");

export function getPGNCollections(): Collection<Document>{
    return pgnGames();
}

/**
 * This function is used to save pgn into database
 * when the game ended */
export async function endGame(doc: Document): Promise<InsertOneResult<Document>> {
    return getPGNCollections().insertOne(doc); 
}