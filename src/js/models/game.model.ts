import { Collection, Filter, UpdateFilter, Document } from "mongodb";
import { getDB } from "../config/database.js";
import { BOARD_TYPE } from "../constant.js";
import { GameDoc, SaveGameOptions } from "../types/game.types.js"


const games = (): Collection<GameDoc> => getDB().collection<GameDoc>("games");
const pgnGames = (): Collection<Document> => getDB().collection("game_history");

// Get data from database
export function getGameCollections(): Collection<GameDoc> { return games(); }
export function getPGNCollections(): Collection<Document> { return pgnGames(); }

// Save game state
export async function saveGame(
    gameID: string,
    state: Partial<GameDoc>,
    { uci, fen, seq, boardType }: SaveGameOptions = {}) {
    try {
        // remove fen history
        const { fenHistory, uciHistory, ...safeState } = state;

        const pushFeilds: Record<string, unknown> = {};
        const setFields: Record<string, unknown> = {
            ...safeState,
            updateAt: new Date()
        };

        // Reset feild
        if (Array.isArray(uciHistory)) setFields.uciHistory = uciHistory;
        if (Array.isArray(fenHistory)) setFields.fenHistory = fenHistory;

        if (uci) pushFeilds.uciHistory = uci;
        if (boardType === BOARD_TYPE.NFC) {
            pushFeilds.fenHistory = fen;
        }

        const updateOp: UpdateFilter<GameDoc> = {
            $set: setFields,
            $setOnInsert: {
                createdAt: new Date(),
            },
        }

        if (Object.keys(pushFeilds).length > 0) {
            updateOp.$push = pushFeilds as UpdateFilter<GameDoc>["push"];
        }

        return games().updateOne(
            { gameID },
            updateOp,
            { upsert: true }
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
export async function getGame(gameID: string): Promise<GameDoc | null> {
    return games().findOne({ gameID } as Filter<GameDoc>);
}

/**This function is used to remove the game */
export async function removeGame(gameID: string) {
    await games().deleteOne({ gameID });
    return { deleted: gameID }
}

/**This function is used to remove the board */
export async function removeGameByBoardID(boardID: string) {
    const docs = await games()
        .find({ boardID } as Filter<GameDoc>)
        .project<{ gameID: string }>({ gameID: 1, _id: 0 })
        .toArray();
    const gameIDs = docs.map((d) => d.gameID);

    const result = await games().deleteMany({ boardID } as Filter<GameDoc>);
    return { deleted: boardID, deletedCount: result.deletedCount, gameIDs };
}

/**
 * This function is used to save pgn into database
 * when the game ended */
export async function endGame(doc: Document) {
    return getPGNCollections().insertOne(doc);
}

/**This function is used to modify PGN */
export async function finishGame(id: string, data: Partial<GameDoc>) {
    const game = games().findOneAndUpdate(
        { _id: id } as unknown as Filter<GameDoc>,
        {
            $set: {
                ...data,
                updateAt: new Date()
            },
        } as UpdateFilter<GameDoc>,
        { returnDocument: "after" }
    );
    return game;
}

// Rename player 
export async function renamePlayer(
    gameID: string,
    color: string,
    name: string
) {
    const field = color === "Black" ? "BlackName" : "WhiteName";
    return games().updateOne({ _id: gameID } as unknown as Filter<GameDoc>, {
        $set: { [field]: name, updateAt: new Date() },
    } as UpdateFilter<GameDoc>);
}