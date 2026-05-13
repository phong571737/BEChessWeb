import { getDB } from "../config/database.js";
import { games as memGames, gameSeq as memGameSeq } from "../game/game.manager.js";

const games = () => getDB().collection("games");
const pgnGames = () => getDB().collection("pgn_games");
const moveGames = () => getDB().collection("moves");

// Get data from database
export function getMoveCollections(){ return moveGames();}
export function getGameCollections(){ return games();}
export function getPGNCollections(){return pgnGames();}

// Save game state
export async function saveGame(gameID, state) {
    try {
        return await games().updateOne(
            {_id: gameID},
            { 
                $set:{ ...state, updateAt: new Date(),},
                $setOnInsert: { createdAt: new Date(),}
            },
            {upsert: true}
        );
    } catch {
        return null;
    }
}

export async function loadAllGame() {
    try {
        return await games().find({ status: { $ne: "finished" } }).toArray();
    } catch {
        // DB not connected — return in-memory games as ActiveGame-like objects
        const result = [];
        for (const [gameID, chess] of memGames) {
            const seq = memGameSeq.get(gameID) ?? chess.history().length;
            const last = chess.history({ verbose: true }).at(-1);
            result.push({
                _id: gameID,
                gameID,
                fen: chess.fen(),
                pgn: chess.pgn(),
                lastMove: last ? { from: last.from, to: last.to, promotion: last.promotion ?? null } : null,
                lastSeq: seq,
                status: "active",
            });
        }
        return result;
    }
}

/**This function is used to load game by id */
export async function loadGame(gameID) {
    try {
        return await games().findOne({ _id: gameID});
    } catch {
        return null;
    }
}

/**This function is used to remove the game */
export async function removeGame(gameID) {
    try {
        await games().deleteOne({ _id: gameID});
    } catch {}
    return{ deleted: gameID }
}

/**
 * This function is used to save pgn into database
 * when the game ended */
export async function endGame(doc) {
    try {
        return await getPGNCollections().insertOne(doc);
    } catch {
        return null;
    }
}

/**
 * Idempotent-ish history insert:
 * skip if the same game snapshot was already written recently.
 */
export async function endGameOnce(doc, dedupeWindowMs = 5 * 60 * 1000) {
    try {
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
    } catch {
        return { inserted: false };
    }
}

/**This function is used to modify PGN */
export async function finishGame(id, data) {
    try {
        return await games().updateOne(
            { _id: id },
            { $set: { ...data, updateAt: new Date() } }
        );
    } catch {
        return null;
    }
}

// Rename player 
export async function renamePlayer(gameID, color, name) {
    try {
        const field = color === "Black" ? "BlackName" : "WhiteName";
        return await games().updateOne(
            {_id: gameID},
            {$set: {[field]: name, updateAt: new Date()}},
        );
    } catch {
        return null;
    }
}
