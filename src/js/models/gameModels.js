import { getDB } from "../config/database.js";

// Get data from database
export function getMoveCollections(){
  return getDB().collection("moves");
}

export function getGameCollections(){
    return getDB().collection("games");
}

const games = () => getDB().collection("games");

export async function saveGame(gameID, state) {
    return games().updateOne(
        {_id: gameID},
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

export async function loadAllGame() {
    return games().find({}).toArray();
}

export async function loadGame(gameID) {
    return games().findOne({ _id: gameID});
}