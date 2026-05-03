import { getDB } from "../config/database.js";

const games = () => getDB().collection("games");
const pgnGames = () => getDB().collection("pgn_games");
const moveGames = () => getDB().collection("moves");

// Get data from database
export function getMoveCollections(){ return moveGames();}
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
    return games().find({ status: { $ne: "finished" } }).toArray();
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

/**
 * Idempotent-ish history insert:
 * skip if the same game snapshot was already written recently.
 */
export async function endGameOnce(doc, dedupeWindowMs = 5 * 60 * 1000) {
    const now = new Date();
    const since = new Date(now.getTime() - dedupeWindowMs);
    const existing = await getPGNCollections().findOne({
        gameID: doc.gameID,
        pgn: doc.pgn,
        Result: doc.Result,
        totalMoves: doc.totalMoves,
        createAt: { $gte: since },
    });

    if (existing) {
        return { inserted: false, existingId: existing._id };
    }

    const insertResult = await getPGNCollections().insertOne(doc);
    return { inserted: true, insertedId: insertResult.insertedId };
}

/**This function is used to modify PGN */
export async function finishGame(id, data) {
    return games().updateOne(
        { _id: id },
        { $set: { ...data, updateAt: new Date() } }
    );
}

// Rename player 
export async function renamePlayer(gameID, color, name) {
    const field = color === "Black" ? "BlackName" : "WhiteName";
    return games().updateOne(
        {_id: gameID},
        {$set: {[field]: name, updateAt: new Date()}},
    )
}
