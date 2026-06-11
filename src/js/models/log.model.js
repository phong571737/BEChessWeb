import { getDB } from "../config/database.js";
import { randomUUID } from "crypto";

const logcollection = () => getDB().collection("log_viewer");

export function getLogCollections() {return logcollection();};

// Create a new session
export async function  createNewGame(gameID) {
    await logcollection().updateMany({
        gameID, isActive: true
    }, {
        $set: {isActive: false, endedAt: new Date()}
    });

    const sessionid = randomUUID();

    // create new session
    await logcollection().insertOne({
        sessionid,
        gameID,
        isActive: true,
        status: "playing",
        startedAt: new Date(),
        moves: [],
    });

    return sessionid;
}

// save log
export async function saveLog(gameID, seq, uci) {
    return logcollection().updateOne(
        {gameID, isActive: true}, // update newest document
        {
            $push: {
                moves: { seq, uci, createdAt: new Date()},
            },
        },
    );
}

// get active session
export async function getActiveSession(gameID) {
    return logcollection().findOne({
        gameID, 
        isActive: true
    })
}

// get all log
export async function getLogsByName(gameID) {
    return logcollection().find({gameID}).sort({startedAt: -1}).toArray();
}

// reset log
export async function endLog(gameID, result = "finished") {
    return logcollection().updateOne(
        {gameID, isActive: true}, 
        {
            $set: {
                isActive: false,
                status: result,
                endedAt: new Date(),
            }
        }
    );
}

// Handle board when the first connect
export async function handleBoardOnline(gameID) {
    const activeGame = await getActiveSession(gameID);

    if (!activeGame) {
        const sessionid = await createNewGame(gameID);
        console.log("New session created", sessionid);
        return sessionid;
    }else {
        console.log("Resume session:", activeGame.sessionid);
    }

    return activeGame.sessionid;
}