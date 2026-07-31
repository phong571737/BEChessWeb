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
    { uci, fen, seq, boardType, expectedVersion, expectedStatus }: SaveGameOptions = {}) {
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

        if (expectedVersion !== undefined) {
            updateOp.$inc = { version: 1 } as unknown as UpdateFilter<GameDoc>["$inc"];
        }

        const filter: Filter<GameDoc> = { gameID } as Filter<GameDoc>;
        // Older game documents predate the version field; treat a missing
        // revision as version 0 for their first guarded transition.
        if (expectedVersion !== undefined) {
            filter.version = expectedVersion === 0
                ? { $in: [0, null] } as unknown as Filter<GameDoc>["version"]
                : expectedVersion;
        }
        if (expectedStatus !== undefined) {
            filter.status = Array.isArray(expectedStatus)
                ? { $in: expectedStatus }
                : expectedStatus;
        }

        return games().updateOne(
            filter,
            updateOp,
            { upsert: expectedVersion === undefined }
        );
    } catch (e) {
        console.log(e);
        return null;
    }
}

export async function getAllGame(limit = 200) {
    return games().find({ status: { $ne: "finished" } } as Filter<GameDoc>).limit(limit).toArray();
}

/**This function is used to load game by id */
export async function getGame(gameID: string): Promise<GameDoc | null> {
    return games().findOne({ gameID } as Filter<GameDoc>);
}

/**
 * Resolves the retained live session for a physical board after a backend
 * reload, when the in-memory board-to-game map has not been rebuilt yet.
 */
export async function getLatestGameByBoardID(boardID: string): Promise<GameDoc | null> {
    return games()
        .find({ boardID, status: { $ne: "finished" } } as Filter<GameDoc>)
        .sort({ updateAt: -1, createdAt: -1 })
        .limit(1)
        .next();
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
    const gameID = doc.gameID;
    if (typeof gameID !== "string" || !gameID) {
        return getPGNCollections().insertOne(doc);
    }

    // A game ID can be finalized once only. A deterministic history _id makes
    // a repeated request/retry an idempotent no-op instead of a second record.
    return getPGNCollections().updateOne(
        { _id: gameID } as unknown as Filter<Document>,
        { $setOnInsert: { ...doc, _id: gameID } },
        { upsert: true },
    );
}

/** Atomically reserves a live game for one resignation operation. */
export async function claimGameResignation(gameID: string): Promise<GameDoc | null> {
    const now = new Date();
    const leaseExpiredAt = new Date(now.getTime() - 30_000);
    return games().findOneAndUpdate(
        {
            gameID,
            $or: [
                { status: { $nin: ["finished", "resigning"] } },
                { status: "resigning", resigningAt: { $lt: leaseExpiredAt } },
                { status: "resigning", resigningAt: null },
            ],
        } as Filter<GameDoc>,
        {
            $set: {
                status: "resigning",
                resigningAt: now,
                updateAt: now,
            },
            $inc: { version: 1 },
        } as unknown as UpdateFilter<GameDoc>,
        { returnDocument: "before" },
    );
}

/** A short-lived MongoDB lease serializes game creation for one physical board. */
interface BoardLock extends Document {
    _id: string;
    owner: string;
    leaseUntil: Date;
    updatedAt: Date;
}

const boardLocks = (): Collection<BoardLock> => getDB().collection<BoardLock>("board_game_locks");

export async function acquireBoardCreationLock(boardID: string, owner: string): Promise<boolean> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 15_000);
    try {
        const result = await boardLocks().findOneAndUpdate(
            { _id: boardID, $or: [{ leaseUntil: { $lte: now } }, { owner }] },
            { $set: { owner, leaseUntil, updatedAt: now } },
            { returnDocument: "after", upsert: true },
        );
        return result?.owner === owner;
    } catch {
        // A concurrent upsert can briefly raise a duplicate-key error; caller
        // treats it as a busy board instead of creating a second game.
        return false;
    }
}

export async function releaseBoardCreationLock(boardID: string, owner: string): Promise<void> {
    await boardLocks().deleteOne({ _id: boardID, owner });
}

/** Releases a failed resignation reservation so a later retry can proceed. */
export async function releaseGameResignationClaim(gameID: string, previousStatus?: string): Promise<void> {
    await games().updateOne(
        { gameID, status: "resigning" } as Filter<GameDoc>,
        {
            $set: {
                status: previousStatus ?? "waiting",
                resigningAt: null,
                updateAt: new Date(),
            },
        } as UpdateFilter<GameDoc>,
    );
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

// Rename player + optional clock settings (milliseconds)
export async function renamePlayer(
    gameID: string,
    color: string,
    name: string,
    initialTimeMs?: number,
    incrementMs?: number,
    round?: number,
    location?: string,
) {
    const field = color === "Black" ? "BlackName" : "WhiteName";
    const update: Record<string, unknown> = { [field]: name, updateAt: new Date() };
    if (initialTimeMs !== undefined) update.initialTimeMs = initialTimeMs;
    if (incrementMs !== undefined) update.incrementMs = incrementMs;
    if (round !== undefined) update.round = round;
    if (location !== undefined) update.location = location;
    return games().updateOne({ gameID } as Filter<GameDoc>, {
        $set: update,
    } as UpdateFilter<GameDoc>);
}
