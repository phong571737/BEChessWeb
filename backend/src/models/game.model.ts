import { Collection, Filter, UpdateFilter, Document, ObjectId } from "mongodb";
import { getDB } from "../config/database.js";
import { GameDoc, SaveGameOptions } from "../types/game.types.js"
import { classifyTimeControl } from "../utils/time-control.js";
import { countHistoryPlies, currentHistoryFen } from "../utils/history-metrics.js";


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

/** Returns true only for a finalized history snapshot (legacy finalized rows are supported). */
function isFinishedHistory(record: Document): boolean {
    if (record.historyStatus === "finished") return true;
    if (record.historyStatus === "active") return false;
    const result = record.result ?? record.Result;
    return result === "1-0" || result === "0-1" || result === "1/2-1/2";
}

// Get data from database
export function getGameCollections(): Collection<GameDoc> { return games(); }
export function getPGNCollections(): Collection<Document> { return pgnGames(); }

/** Loads one non-deleted history snapshot by its public id. */
export async function getHistoryRecord(id: string): Promise<Document | null> {
    return pgnGames().findOne(historyIdFilter(id, false));
}

/** Keeps an up-to-date review snapshot while a game is in progress. */
export async function saveHistorySnapshot(doc: Document): Promise<void> {
    const gameID = doc.gameID;
    if (typeof gameID !== "string" || !gameID) return;

    const now = new Date();
    const { createdAt, ...historyFields } = doc;
    delete historyFields._id;
    // Counter fields are derived from fenHistory and are not persisted.
    delete historyFields.totalMoves;
    delete historyFields.totalPlies;
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
    const totalPlies = countHistoryPlies(game);
    // Do not create history rows for a game that has not accepted its first
    // move yet. Such rows are setup/restart placeholders, not playable games.
    if (totalPlies <= 0) return;
    await saveHistorySnapshot({
        gameID: game.gameID,
        boardID: game.boardID,
        boardNumber: game.boardNumber,
        location: game.location,
        pgn: game.pgn ?? "",
        fen: currentHistoryFen(game),
        currentFen: currentHistoryFen(game),
        initialFen: game.initialFen,
        lastMove: game.lastMove ?? null,
        lastSeq: totalPlies,
        uciHistory: game.uciHistory ?? [],
        fenHistory: game.fenHistory ?? [],
        ...(Array.isArray(game.fenHistoryEdited)
            ? { fenHistoryEdited: game.fenHistoryEdited }
            : {}),
        moveDurationsMs: game.moveDurationsMs ?? [],
        whiteName: game.whiteName ?? game.WhiteName ?? "White",
        blackName: game.blackName ?? game.BlackName ?? "Black",
        // Legacy aliases are retained in the snapshot response during the
        // migration window; new canonical data is stored in lowercase fields.
        WhiteName: game.whiteName ?? game.WhiteName ?? "White",
        BlackName: game.blackName ?? game.BlackName ?? "Black",
        result: "*",
        Result: "*",
        Date: pgnDate(game.startedAt ?? game.createdAt, now),
        round: game.round ?? 1,
        startedAt: game.startedAt ?? null,
        lastMoveAt: game.lastMoveAt ?? null,
        durationSec: game.durationSec ?? 0,
        initialTimeMs: game.initialTimeMs,
        incrementMs: game.incrementMs,
        whiteRemainingMs: game.whiteRemainingMs ?? game.whiteRemainingTimeMs,
        blackRemainingMs: game.blackRemainingMs ?? game.blackRemainingTimeMs,
        activeClockSide: game.activeClockSide ?? "white",
        clockStartedAt: game.clockStartedAt ?? null,
        timeControlType: classifyTimeControl(game.initialTimeMs, game.incrementMs),
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

export type UpdateHistoryTracesResult =
    | { status: "saved"; pgn: string; uciHistory: string[] }
    | { status: "not_found" }
    | { status: "active" };

/** Updates only administrator-editable PGN/UCI traces; raw and corrected FEN arrays stay untouched. */
export async function updateHistoryTraces(
    id: string,
    updates: { pgn?: string; uciHistory?: string[] },
): Promise<UpdateHistoryTracesResult> {
    const filter = historyIdFilter(id, false);
    const record = await pgnGames().findOne(filter, { projection: { pgn: 1, uciHistory: 1, historyStatus: 1, result: 1, Result: 1 } });
    if (!record) return { status: "not_found" };
    if (!isFinishedHistory(record)) return { status: "active" };

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.pgn !== undefined) set.pgn = updates.pgn;
    if (updates.uciHistory !== undefined) set.uciHistory = updates.uciHistory;
    const result = await pgnGames().updateOne(filter, { $set: set, $unset: { analysis: "" } });
    if (result.matchedCount !== 1) return { status: "not_found" };

    const previousUci = Array.isArray(record.uciHistory)
        ? record.uciHistory.filter((value): value is string => typeof value === "string")
        : [];
    return {
        status: "saved",
        pgn: updates.pgn ?? String(record.pgn ?? ""),
        uciHistory: updates.uciHistory ?? previousUci,
    };
}

export type DeleteHistoryFenResult =
    | { status: "deleted"; fenHistory: string[] }
    | { status: "not_found" | "active" | "invalid_index" | "conflict" };

export type AppendHistoryFenResult =
    | { status: "saved"; fenHistory: string[] }
    | { status: "not_found" }
    | { status: "active" }
    | { status: "conflict" };

export type UpdateHistoryFenResult = AppendHistoryFenResult | { status: "invalid_index" };

export type ReplaceHistoryFensResult = AppendHistoryFenResult;

/**
 * Appends one administrator-corrected FEN snapshot. The original array is
 * included in the update predicate so concurrent editors cannot silently
 * overwrite each other.
 */
export async function appendHistoryFen(id: string, fen: string): Promise<AppendHistoryFenResult> {
    const filter = historyIdFilter(id, false);
    const record = await pgnGames().findOne(filter, { projection: { fenHistory: 1, fenHistoryEdited: 1, historyStatus: 1, result: 1, Result: 1 } });
    if (!record) return { status: "not_found" };
    if (!isFinishedHistory(record)) return { status: "active" };

    const hasEditedHistory = Array.isArray(record.fenHistoryEdited);
    const sourceHistory = hasEditedHistory ? record.fenHistoryEdited : record.fenHistory;
    const fenHistory = Array.isArray(sourceHistory)
        ? (sourceHistory as unknown[]).filter((value): value is string => typeof value === "string")
        : [];
    const nextFenHistory = [...fenHistory, fen];
    const fenPredicate = hasEditedHistory
        ? { fenHistoryEdited: record.fenHistoryEdited }
        : { fenHistoryEdited: { $exists: false } };
    const result = await pgnGames().updateOne(
        { $and: [filter, fenPredicate] } as unknown as Filter<Document>,
        {
            $set: { fenHistoryEdited: nextFenHistory, updatedAt: new Date() },
            $unset: {
                analysis: "",
                fenHistoryStandard: "",
                initialFenStandard: "",
                standardPgn: "",
                standardBestPgn: "",
                fenStandardStatus: "",
                fenStandardUpdatedAt: "",
            },
        },
    );
    if (result.modifiedCount !== 1) return { status: "conflict" };
    return { status: "saved", fenHistory: nextFenHistory };
}

/** Replaces one FEN snapshot while preserving every other history field. */
export async function updateHistoryFen(id: string, index: number, fen: string): Promise<UpdateHistoryFenResult> {
    const filter = historyIdFilter(id, false);
    const record = await pgnGames().findOne(filter, { projection: { fenHistory: 1, fenHistoryEdited: 1, historyStatus: 1, result: 1, Result: 1 } });
    if (!record) return { status: "not_found" };
    if (!isFinishedHistory(record)) return { status: "active" };

    const sourceHistory = Array.isArray(record.fenHistoryEdited) ? record.fenHistoryEdited : record.fenHistory;
    const fenHistory = Array.isArray(sourceHistory)
        ? sourceHistory.filter((value): value is string => typeof value === "string")
        : [];
    if (!Number.isInteger(index) || index < 0 || index >= fenHistory.length) {
        return { status: "invalid_index" };
    }

    const nextFenHistory = [...fenHistory];
    nextFenHistory[index] = fen;
    const result = await pgnGames().updateOne(
        { $and: [filter, Array.isArray(record.fenHistoryEdited)
            ? { fenHistoryEdited: record.fenHistoryEdited }
            : { fenHistoryEdited: { $exists: false } }] } as unknown as Filter<Document>,
        {
            $set: { fenHistoryEdited: nextFenHistory, updatedAt: new Date() },
            $unset: {
                analysis: "",
                fenHistoryStandard: "",
                initialFenStandard: "",
                standardPgn: "",
                standardBestPgn: "",
                fenStandardStatus: "",
                fenStandardUpdatedAt: "",
            },
        },
    );
    if (result.modifiedCount !== 1) return { status: "conflict" };
    return { status: "saved", fenHistory: nextFenHistory };
}

/** Atomically replaces the complete persisted FEN sequence for an administrator correction. */
export async function replaceHistoryFens(id: string, fens: string[]): Promise<ReplaceHistoryFensResult> {
    const filter = historyIdFilter(id, false);
    const record = await pgnGames().findOne(filter, { projection: { fenHistory: 1, fenHistoryEdited: 1, historyStatus: 1, result: 1, Result: 1 } });
    if (!record) return { status: "not_found" };
    if (!isFinishedHistory(record)) return { status: "active" };

    const hasEditedHistory = Array.isArray(record.fenHistoryEdited);
    const fenPredicate = hasEditedHistory
        ? { fenHistoryEdited: record.fenHistoryEdited }
        : { fenHistoryEdited: { $exists: false } };
    const result = await pgnGames().updateOne(
        { $and: [filter, fenPredicate] } as unknown as Filter<Document>,
        {
            $set: { fenHistoryEdited: fens, updatedAt: new Date() },
            $unset: {
                analysis: "",
                fenHistoryStandard: "",
                initialFenStandard: "",
                standardPgn: "",
                standardBestPgn: "",
                fenStandardStatus: "",
                fenStandardUpdatedAt: "",
            },
        },
    );
    if (result.matchedCount !== 1) return { status: "conflict" };
    return { status: "saved", fenHistory: fens };
}

/**
 * Removes one persisted FEN snapshot without changing UCI history or PGN.
 * The exact-array predicate prevents two concurrent admin edits from
 * overwriting each other, and stale Stockfish analysis is cleared because it
 * was calculated from the previous position sequence.
 */
export async function deleteHistoryFen(id: string, index: number): Promise<DeleteHistoryFenResult> {
    const filter = historyIdFilter(id, false);
    const record = await pgnGames().findOne(filter, { projection: { fenHistory: 1, fenHistoryEdited: 1, historyStatus: 1, result: 1, Result: 1 } });
    if (!record) return { status: "not_found" };
    if (!isFinishedHistory(record)) return { status: "active" };

    const sourceHistory = Array.isArray(record.fenHistoryEdited) ? record.fenHistoryEdited : record.fenHistory;
    const fenHistory = Array.isArray(sourceHistory)
        ? sourceHistory.filter((fen): fen is string => typeof fen === "string")
        : [];
    if (!Number.isInteger(index) || index < 0 || index >= fenHistory.length) {
        return { status: "invalid_index" };
    }

    const nextFenHistory = fenHistory.filter((_, fenIndex) => fenIndex !== index);
    const result = await pgnGames().updateOne(
        { $and: [filter, Array.isArray(record.fenHistoryEdited)
            ? { fenHistoryEdited: record.fenHistoryEdited }
            : { fenHistoryEdited: { $exists: false } }] } as unknown as Filter<Document>,
        {
            $set: { fenHistoryEdited: nextFenHistory, updatedAt: new Date() },
            $unset: {
                analysis: "",
                fenHistoryStandard: "",
                initialFenStandard: "",
                standardPgn: "",
                standardBestPgn: "",
                fenStandardStatus: "",
                fenStandardUpdatedAt: "",
            },
        },
    );
    if (result.modifiedCount !== 1) return { status: "conflict" };
    return { status: "deleted", fenHistory: nextFenHistory };
}

// Save game state
export async function saveGame(
    gameID: string,
    state: Partial<GameDoc>,
    { uci, fen, seq, boardType, moveDurationMs, expectedVersion, expectedStatus }: SaveGameOptions = {}) {
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
        if (typeof moveDurationMs === "number" && Number.isFinite(moveDurationMs)) {
            pushFeilds.moveDurationsMs = Math.max(0, Math.round(moveDurationMs));
        }
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

/** Retires the previous live session while preserving its history snapshot. */
export async function closeActiveGamesForBoard(boardID: string): Promise<number> {
    const now = new Date();
    const result = await games().updateMany(
        { boardID, status: { $nin: ["finished", "resigning", "ended"] } } as Filter<GameDoc>,
        { $set: { status: "ended", result: "*", endedAt: now, updateAt: now } } as UpdateFilter<GameDoc>,
    );
    return result.modifiedCount;
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
        const { totalMoves: _legacyTotalMoves, totalPlies: _legacyTotalPlies, ...cleanDoc } = doc;
        return getPGNCollections().insertOne(cleanDoc);
    }

    const totalPlies = countHistoryPlies(doc as GameDoc);
    if (!Number.isFinite(totalPlies) || totalPlies <= 0) {
        // A resign/draw received before the first move must not leave an
        // empty history record behind.
        return getPGNCollections().deleteOne({ _id: gameID } as unknown as Filter<Document>);
    }

    const { createdAt, ...historyFields } = doc;
    delete historyFields._id;
    delete historyFields.totalMoves;
    delete historyFields.totalPlies;
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
        { $set: { result: "*", Result: "*", historyStatus: "finished", outcomeStatus: "unconfirmed", updatedAt: new Date() } },
    );
    return result.modifiedCount === 1;
}

/** Rewrites both PGN result locations while preserving headers and move text. */
function replacePgnResult(pgn: string, result: "1-0" | "0-1" | "1/2-1/2"): string {
    if (!pgn.trim()) return pgn;

    const withHeader = /^\[Result\s+"[^"]*"\]\s*$/m.test(pgn)
        ? pgn.replace(/^\[Result\s+"[^"]*"\]\s*$/m, `[Result "${result}"]`)
        : `[Result "${result}"]\n${pgn}`;

    // A standard PGN repeats Result at the end of the movetext. Replace an
    // existing terminal marker or append one when legacy records omitted it.
    return /(?:1-0|0-1|1\/2-1\/2|\*)\s*$/.test(withHeader)
        ? withHeader.replace(/(?:1-0|0-1|1\/2-1\/2|\*)\s*$/, result)
        : `${withHeader.trimEnd()} ${result}`;
}

/** Updates a saved history result without changing its moves or board trace. */
export async function updateHistoryResult(
    id: string,
    result: "1-0" | "0-1" | "1/2-1/2",
): Promise<boolean> {
    const record = await pgnGames().findOne(historyIdFilter(id, false));
    if (!record) return false;

    const currentPgn = typeof record.pgn === "string" ? record.pgn : "";
    const pgn = replacePgnResult(currentPgn, result);
    const now = new Date();
    const update = await pgnGames().updateOne(
        historyIdFilter(id, false),
        {
            $set: {
                Result: result,
                result,
                outcomeStatus: "confirmed",
                historyStatus: "finished",
                endedAt: record.endedAt ?? now,
                updatedAt: now,
                ...(pgn ? { pgn } : {}),
            },
        },
    );

    // Keep a still-live game consistent with its finalized history snapshot.
    if (typeof record.gameID === "string") {
        await games().updateOne(
            { gameID: record.gameID } as Filter<GameDoc>,
            { $set: { result, status: "finished", updateAt: now } } as UpdateFilter<GameDoc>,
        );
    }
    return update.matchedCount === 1;
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
    boardNumber?: string
) {
    const field = color === "Black" ? "BlackName" : "WhiteName";
    const canonicalField = color === "Black" ? "blackName" : "whiteName";
    const update: Record<string, unknown> = {
        [field]: name,
        [canonicalField]: name,
        updateAt: new Date(),
    };
    if (initialTimeMs !== undefined) update.initialTimeMs = initialTimeMs;
    if (incrementMs !== undefined) update.incrementMs = incrementMs;
    if (initialTimeMs !== undefined || incrementMs !== undefined) {
        const current = await games().findOne(
            { gameID } as Filter<GameDoc>,
            { projection: { initialTimeMs: 1, incrementMs: 1 } },
        );
        update.timeControlType = classifyTimeControl(
            initialTimeMs ?? current?.initialTimeMs,
            incrementMs ?? current?.incrementMs,
        );
    }
    if (round !== undefined) update.round = round;
    if (boardNumber !== undefined) update.boardNumber = boardNumber.trim();
    if (location !== undefined) update.location = location;
    return games().updateOne({ gameID } as Filter<GameDoc>, {
        $set: update,
    } as UpdateFilter<GameDoc>);
}
