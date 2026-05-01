import { getDB } from "../config/database.js";

const logviewer = () => getDB().collection("log_viewer");

export function getLogCollections() {return logviewer();};

// save log
export async function saveLog(gameID, seq, uci, lift, place) {
    return logviewer().updateOne(
        {gameID, isActive: true}, // update newest document
        {
            $push: {
                moves: { seq, uci, lift, place, createdAt: new Date()},
            },
            $setOnInsert: {
                gameID,
                isActive: true,
                startedAt: new Date()
            }
        },
        {upsert: true} // if don't have, new creation
    );
}

// get log
export async function getLogsByName(gameID) {
    return logviewer().find({gameID}).toArray();
}

// reset log
export async function resetLog(gameID) {
    // turn off the old game
    await logviewer().updateMany(
        {gameID, isActive: true},
        {$set: { isActive: false}},
    );

    // create a new game
    return logviewer().insertOne({
        gameID,
        startedAt: new Date(),
        isActive: true,
        moves: [],
    })
}