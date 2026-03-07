import { getDB } from "../config/database.js";

// Get data from database
export function getMoveCollections(){
  return getDB().collection("moves");
}

export function getGameCollections(){
    return getDB().collection("games");
}

export function getPGNCollections(){
    return getDB().collection("pgn_games");
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

/**This function is used to load game by id */
export async function loadGame(gameID) {
    return games().findOne({ _id: gameID});
}

/**This function is used to remove the game */
export async function removeGame(gameID) {
    await games().deleteOne({ _id: gameID});
    return{
        deleted: _id
    }
}

/**This function is used to save pgn into database
 * when the game ended */
export async function endGame(pgn) {
    return getPGNCollections().insertOne({
        pgn: pgn,
        createdAt: new Date(),
    }); 
}