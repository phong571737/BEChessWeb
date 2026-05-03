import { getDB } from "../config/database.js";

const games = () => getDB().collection("games");
const pgnGames = () => getDB().collection("pgn_games");

// Get data from database
export function getGameCollections(){ return games();}
export function getPGNCollections(){return pgnGames();}

// Save game state
export async function saveGame(gameID, state) {
    return games().updateOne(
        {_id: gameID},
        { 
            $set:{ ...state, updateAt: new Date(),},
            $setOnInsert: { createdAt: new Date(),}
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
    return{ deleted: gameID }
}

/**
 * This function is used to save pgn into database
 * when the game ended */
export async function endGame(doc) {
    return getPGNCollections().insertOne(doc); 
}

/**This function is used to modify PGN */
export async function finishGame(id, data) {
    const game = games().findByIdAndUpdate(
        id, 
        {
            ...data,
            updateAt: new  Date()
        },
        {new: true}
    );
    return game;
}

// Rename player 
export async function renamePlayer(gameID, color, name) {
    const field = color === "Black" ? "BlackName" : "WhiteName";
    return games().updateOne(
        {_id: gameID},
        {$set: {[field]: name, updateAt: new Date()}},
    )
}