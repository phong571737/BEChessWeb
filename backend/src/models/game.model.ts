import { Collection, Filter, UpdateFilter, Document, ObjectId } from "mongodb";
import { getDB } from "../config/database.js";
import { GameDoc, SaveGameOptions } from "../types/game.types.js"
import { classifyTimeControl } from "../utils/time-control.js";


const games = (): Collection<GameDoc> => getDB().collection<GameDoc>("games");
const pgnGames = (): Collection<Document> => getDB().collection("game_history");
const HISTORY_RETENTION_DAYS = 30;

function historyIdFilter(id: string, deleted: boolean): Filter<Document> {
    const ids: unknown[] = [id];
    if (ObjectId.isValid(id)) ids.push(new ObjectId(id));
    return {
        $and: [
            { $or: ids.map((_id) => ({ _id })) },
            deleted ? { deletedAt: { $exists: true } } : { deletedAt: { $exists: false } },
        ],
    } as unknown as Filter<Document>;
}

// Get data from database
export function getGameCollections(): Collection<GameDoc> { return games(); }
export function getPGNCollections(): Collection<Document> { return pgnGames(); }

/** Keeps an up-to-date review snapshot while a game is in progress. */
export async function saveHistorySnapshot(doc: Document): Promise<void> {
    const gameID = doc.gameID;
    if (typeof gameID !== "string" || !gameID) return;

    const now = new Date();
    const { createdAt, ...historyFields } = doc;
    delete historyFields._id;
    await pgnGames().updateOne(
        { _id: gameID, deletedAt: { $exists: false } } as unknown as Filter<Document>,
        {
            $set: { ...historyFields, historyStatus: "active", updatedAt: now },
            $setOnInsert: { createdAt: createdAt ?? now },
        },
        { upsert: true },
    );
}

function pgnDate(value: unknown, fallback = new Date()): string {
    const date = value instanceof Date ? value : new Date(String(value ?? ""));
    const resolved = Number.isNaN(date.getTime()) ? fallback : date;
    return resolved.toISOString().slice(0, 10).replace(/-/g, ".");
}

/** Mirrors durable live-game metadata into its in-progress history record. */
export async function saveActiveGameHistorySnapshot(game: GameDoc): Promise<void> {
    const now = new Date();
    const totalPlies = game.lastSeq ?? game.uciHistory?.length ?? game.fenHistory?.length ?? 0;
    // Do not create history rows for a game that has not accepted its first
    // move yet. Such rows are setup/restart placeholders, not playable games.
    if (totalPlies <= 0) return;
    await saveHistorySnapshot({
        gameID: game.gameID,
        boardID: game.boardID,
        location: game.location,
        pgn: game.pgn ?? "",
        fen: game.fen,
        initialFen: game.initialFen,
        lastMove: game.lastMove ?? null,
        lastSeq: totalPlies,
        totalMoves: totalPlies,
        totalPlies,
        uciHistory: game.uciHistory ?? [],
        fenHistory: game.fenHistory ?? [],
        WhiteName: game.WhiteName ?? "White",
        BlackName: game.BlackName ?? "Black",
        Result: "*",
        Date: pgnDate(game.startedAt ?? game.createdAt, now),
        round: game.round ?? 1,
        startedAt: game.startedAt ?? null,
        lastMoveAt: game.lastMoveAt ?? null,
        durationSec: game.durationSec ?? 0,
        initialTimeMs: game.initialTimeMs,
        incrementMs: game.incrementMs,
        timeControlType: game.timeControlType ?? classifyTimeControl(game.initialTimeMs, game.incrementMs),
        createdAt: game.createdAt ?? now,
    });
}

/** Stores an administrator-requested post-game engine analysis on its history snapshot. */
export async function saveHistoryAnalysis(id: string, analysis: Document): Promise<boolean> {
    const result = await pgnGames().updateOne(
        historyIdFilter(id, false),
        { $set: { analysis, updatedAt: new Date() } },
    );
    return result.modifiedCount === 1;
}

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
        // The server-calculated FEN is available for both Hall and NFC moves.
        // Persist it for every accepted move so an unfinished game can always
        // be replayed even when a device did not send its own FEN payload.
        if (typeof fen === "string" && fen.trim()) {
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
        .find({ boardID, status: { $nin: ["finished", "resigning", "ended"] } } as Filter<GameDoc>)
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

    const totalPlies = Math.max(
        Number(doc.totalMoves ?? 0),
        Number(doc.totalPlies ?? 0),
        Array.isArray(doc.uciHistory) ? doc.uciHistory.length : 0,
        Array.isArray(doc.fenHistory) ? doc.fenHistory.length : 0,
    );
    if (!Number.isFinite(totalPlies) || totalPlies <= 0) {
        // A resign/draw received before the first move must not leave an
        // empty history record behind.
        return getPGNCollections().deleteOne({ _id: gameID } as unknown as Filter<Document>);
    }

    const { createdAt, ...historyFields } = doc;
    delete historyFields._id;
    // A move may already have created a live snapshot. Finalization updates
    // that same deterministic record instead of creating another history row.
    return getPGNCollections().updateOne(
        { _id: gameID } as unknown as Filter<Document>,
        {
            $set: { ...historyFields, historyStatus: "finished", updatedAt: new Date() },
            $setOnInsert: { createdAt: createdAt ?? new Date() },
        },
        { upsert: true },
    );
}

/** Marks a finalized session as completed but without a confirmed winner. */
export async function markHistoryUnfinished(gameID: string): Promise<boolean> {
    const result = await pgnGames().updateOne(
        { _id: gameID } as unknown as Filter<Document>,
        { $set: { Result: "*", historyStatus: "finished", outcomeStatus: "unconfirmed", updatedAt: new Date() } },
    );
    return result.modifiedCount === 1;
}

export async function moveHistoryToTrash(id: string): Promise<boolean> {
    const now = new Date();
    const result = await pgnGames().updateOne(
        historyIdFilter(id, false),
        { $set: { deletedAt: now, deleteAfter: new Date(now.getTime() + HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1_000) } },
    );
    return result.modifiedCount === 1;
}

export async function restoreHistoryFromTrash(id: string): Promise<boolean> {
    const result = await pgnGames().updateOne(
        historyIdFilter(id, true),
        { $unset: { deletedAt: "", deleteAfter: "" }, $set: { updatedAt: new Date() } },
    );
    return result.modifiedCount === 1;
}

/** Permanently deletes only a record that has already been moved to trash. */
export async function permanentlyDeleteHistoryFromTrash(id: string): Promise<boolean> {
    const result = await pgnGames().deleteOne(historyIdFilter(id, true));
    return result.deletedCount === 1;
}

/** Permanently empties only records that are already in the recycle bin. */
export async function permanentlyDeleteAllHistoryFromTrash(): Promise<number> {
    const result = await pgnGames().deleteMany({ deletedAt: { $exists: true } });
    return result.deletedCount;
}

/** MongoDB TTL removes trashed records after the configured retention period. */
export async function ensureHistoryIndexes(): Promise<void> {
    await pgnGames().createIndex({ deleteAfter: 1 }, { expireAfterSeconds: 0, name: "history_trash_expiry" });
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
    if (initialTimeMs !== undefined || incrementMs !== undefined) {
        update.timeControlType = classifyTimeControl(initialTimeMs, incrementMs);
    }
    if (round !== undefined) update.round = round;
    if (location !== undefined) update.location = location;
    return games().updateOne({ gameID } as Filter<GameDoc>, {
        $set: update,
    } as UpdateFilter<GameDoc>);
}
