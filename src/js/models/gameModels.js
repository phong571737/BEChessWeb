import { getDB } from "../config/database.js";

// Get data from database
export function getMoveCollections(){
  return getDB().collection("moves");
}

export function getGameCollections(){
    return getDB().collection("games");
}

const games = () => getDB().collection("games");

export async function saveGame(state) {
    return games().updateOne(
        {_id: "current_game"},
        { 
            $set:{
                ...state,
                updateAt: new Date(),
            },
            $setOnInsert: {
                createdAt: new Date(),
            }
        },
        {upsert: true}
    );
}

export async function loadGame() {
    return games().findOne({ _id: "current_game"});
}