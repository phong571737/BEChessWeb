import { getDB } from "../config/database.js";
import { randomUUID } from "crypto";

const logcollection = () => getDB().collection("log_viewer");

export function getLogCollections() {return logcollection();};

// Create a new session
export async function  createNewGame(gameID: string) {
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

// get active session
export async function getActiveSession(gameID: string) {
    return logcollection().findOne({
        gameID, 
        isActive: true
    })
}

// get all log
export async function getLogsByName(gameID: string) {
    return logcollection().find({gameID}).sort({startedAt: -1}).toArray();
}

// Handle board when the first connect
// export async function handleBoardOnline(gameID) {
//     const activeGame = await getActiveSession(gameID);

//     if (!activeGame) {
//         const sessionid = await createNewGame(gameID);
//         console.log("New session created", sessionid);
//         return sessionid;
//     }else {
//         console.log("Resume session:", activeGame.sessionid);
//     }

//     return activeGame.sessionid;
// }