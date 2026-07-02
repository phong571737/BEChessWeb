import { getDB } from "../config/database.js";
import { BOARD_TYPE } from "../constant.js";

const games = () => getDB().collection("games");
const pgnGames = () => getDB().collection("game_history");

// Get data from database
export function getGameCollections() { return games(); }
export function getPGNCollections() { return pgnGames(); }

// Save game state
export async function saveGame(gameID, state, { uci, fen, seq, boardType } = {}) {
    try {
        // remove fen history
        const { fenHistory, uciHistory, ...safeState } = state;

        const pushFeilds = {};
        const setFields = { ...safeState, updateAt: new Date() };

        // Reset feild
        if (Array.isArray(uciHistory)) setFields.uciHistory = uciHistory;
        if (Array.isArray(fenHistory)) setFields.fenHistory = fenHistory;

        if (uci) pushFeilds.uciHistory = uci;
        if (boardType === BOARD_TYPE.NFC) {
            pushFeilds.fenHistory = fen;
        }

        const updateOp = {
            // $set: {
            //     ...safeState,
            //     updateAt: new Date(),
            // },
            $set: setFields,
            $setOnInsert: {
                createdAt: new Date(),
            },
        }

        if (Object.keys(pushFeilds).length > 0) {
            updateOp.$push = pushFeilds;
        }

        return games().updateOne(
            { gameID },
            updateOp,
            {upsert: true}
        );
    } catch (e) {
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
    await games().deleteOne({ gameID });
    return { deleted: gameID }
}

/**This function is used to remove the board */
export async function removeGameByBoardID(boardID) {
    const result = await games().deleteMany({ boardID });
    return { deleted: boardID, deletedCount: result.deletedCount };
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
            updateAt: new Date()
        },
        { new: true }
    );
    return game;
}

// Rename player 
export async function renamePlayer(gameID, color, name) {
    const field = color === "Black" ? "BlackName" : "WhiteName";
    return games().updateOne(
        { _id: gameID },
        { $set: { [field]: name, updateAt: new Date() } },
    )
}