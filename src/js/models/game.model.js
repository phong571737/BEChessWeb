import { getDB } from "../config/database.js";

const games = () => getDB().collection("games");
const pgnGames = () => getDB().collection("pgn_games");

// Get data from database
export function getGameCollections(){ return games();}
export function getPGNCollections(){return pgnGames();}

// Save game state
export async function saveGame(gameID, state, {uci, fen, seq} = {}) {
    try {
        // remove fen history
        const {fenHistory, ...safeState} = state;

        return games().updateOne(
            {_id: gameID},
            { 
                $set:{ ...safeState, 
                    updateAt: new Date(),
                },
                $setOnInsert: { 
                    createdAt: new Date(),
                    // fenHistory: []
                },

                $push: {
                    fenHistory: {
                        seq: seq ?? state.seq,
                        fen: fen ?? state.fen,
                        move: uci ?? state.move,
                        timestamp: new Date(),
                    }
                }
            },
            {upsert: true}
        );
    } catch (e){
        console.log(e);
        return null;
    }
}

export async function getAllGame() {
    return games().find({}).toArray();
}

/**This function is used to load game by id */
export async function getGame(gameID) {
    return games().findOne({ gameID });
}

/**This function is used to remove the game */
export async function removeGame(gameID) {
    await games().deleteOne({ gameID});
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