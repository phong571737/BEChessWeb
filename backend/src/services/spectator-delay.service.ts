import { Document, ObjectId } from "mongodb";
import { getDB } from "../config/database.js";
import { getAllGame } from "../models/game.model.js";
import { getSpectatorDelayMs, setSpectatorDelayMs } from "../models/broadcast-setting.model.js";
import { getIO } from "../sockets/index.js";
import { getCurrentClock } from "./clock.service.js";
import type { GameDoc } from "../types/game.types.js";

type BroadcastScope = "global" | "game";

interface DelayedBroadcast extends Document {
    _id?: ObjectId;
    event: string;
    payload: unknown;
    scope: BroadcastScope;
    gameID?: string;
    releaseAt: Date;
    createdAt: Date;
    publicGame?: GameDoc;
    removePublicGameID?: string;
    removePublicGameIDs?: string[];
}

interface BroadcastOptions {
    scope?: BroadcastScope;
    gameID?: string;
    publicGame?: GameDoc;
    removePublicGameID?: string;
}

let worker: NodeJS.Timeout | null = null;
let releasing = false;
const lastReleaseByStream = new Map<string, number>();

function queue() {
    return getDB().collection<DelayedBroadcast>("spectator_events");
}

function publicGames() {
    return getDB().collection<GameDoc>("public_game_snapshots");
}

function withoutMongoId(game: GameDoc): GameDoc {
    const copy = { ...game } as GameDoc & { _id?: unknown };
    delete copy._id;
    return copy;
}

async function applyPublicState(item: DelayedBroadcast): Promise<void> {
    if (item.removePublicGameID) {
        await publicGames().deleteOne({ gameID: item.removePublicGameID });
    }
    if (item.removePublicGameIDs?.length) {
        await publicGames().deleteMany({ gameID: { $in: item.removePublicGameIDs } });
    }
    if (item.publicGame?.gameID) {
        const game = withoutMongoId(item.publicGame);
        if (game.clockStartedAt && ["playing", "active"].includes(game.status ?? "")) {
            game.clockStartedAt = item.releaseAt;
        }
        // A replacement session for the same physical board supersedes the
        // previously released public snapshot. Without this cleanup, every
        // resign/new-game cycle leaves another card with the same boardID.
        if (typeof game.boardID === "string" && game.boardID.trim()) {
            await publicGames().deleteMany({
                boardID: game.boardID,
                gameID: { $ne: game.gameID },
            });
        }
        await publicGames().replaceOne({ gameID: game.gameID }, game, { upsert: true });
    }
}

function publicPayload(item: DelayedBroadcast): unknown {
    if (item.event !== "clock_state" || !item.payload || typeof item.payload !== "object") return item.payload;
    const payload = { ...(item.payload as Record<string, unknown>) };
    if (payload.clockStartedAt) payload.clockStartedAt = item.releaseAt.toISOString();
    payload.serverNow = item.releaseAt.getTime();
    return payload;
}

function emitToAudience(audience: "admin" | "public", event: string, payload: unknown, scope: BroadcastScope, gameID?: string): void {
    const io = getIO();
    if (scope === "game" && gameID) {
        io.to(`game:${gameID}:${audience}`).emit(event, payload);
        return;
    }
    // Global live-board events must also reach sockets that connected while
    // their audience-room join was still being registered. Emit directly to
    // the sockets classified at handshake time so the delayed move is not
    // silently lost and only discovered after a page reload.
    for (const socket of io.sockets.sockets.values()) {
        if (socket.data.audience === audience) socket.emit(event, payload);
    }
}

async function release(item: DelayedBroadcast): Promise<void> {
    await applyPublicState(item);
    emitToAudience("public", item.event, publicPayload(item), item.scope, item.gameID);

    // `esp_move` is the fast path, but a browser can miss it while polling is
    // upgrading or reconnecting. Send the same already-delayed durable state
    // through the normal Socket.IO hydration events as well. This is not an
    // HTTP reload: home cards receive a global snapshot and an open board that
    // joined its room receives its own restore payload.
    if (item.event !== "esp_move" || !item.gameID) return;
    const game = await getPublicGameSnapshot(item.gameID);
    if (!game) return;

    const activeGames = await getPublicGameSnapshots();
    emitToAudience("public", "active_games_snapshot", activeGames.map((activeGame) => ({
        ...activeGame,
        ...getCurrentClock(activeGame),
    })), "global");
    emitToAudience("public", "restore_game", {
        gameID: game.gameID,
        fen: game.fen,
        pgn: game.pgn,
        lastMove: game.lastMove,
        fenHistory: game.fenHistory,
    }, "game", game.gameID);
}

async function releaseDueEvents(): Promise<void> {
    if (releasing) return;
    releasing = true;
    try {
        const due = await queue().find({ releaseAt: { $lte: new Date() } }).sort({ releaseAt: 1, createdAt: 1 }).limit(100).toArray();
        for (const item of due) {
            await release(item);
            if (item._id) await queue().deleteOne({ _id: item._id });
        }
    } finally {
        releasing = false;
    }
}

function nextReleaseAt(delayMs: number, options: BroadcastOptions): Date {
    const stream = options.gameID ?? "global";
    const requested = Date.now() + delayMs;
    const releaseAt = Math.max(requested, (lastReleaseByStream.get(stream) ?? 0) + 1);
    lastReleaseByStream.set(stream, releaseAt);
    return new Date(releaseAt);
}

/**
 * Applies a changed delay to events that have not been released yet. Rebuild
 * the in-memory stream clocks as well; otherwise an earlier 60-second setting
 * can keep newly queued events at 60 seconds after the admin selects 30.
 */
async function reschedulePendingEvents(delayMs: number): Promise<void> {
    const pending = await queue()
        .find({})
        .sort({ createdAt: 1, _id: 1 })
        .toArray();
    const releaseByStream = new Map<string, number>();
    const shiftByStream = new Map<string, number>();
    const now = Date.now();
    const operations = pending.flatMap((item) => {
        if (!item._id) return [];
        const stream = item.gameID ?? "global";
        const createdAt = new Date(item.createdAt).getTime();
        const requested = (Number.isFinite(createdAt) ? createdAt : now) + delayMs;
        // If a shorter delay makes several queued events overdue, shift the
        // whole stream forward by the same amount. The first event is released
        // now while every following move keeps its original time gap instead
        // of all overdue moves being emitted in one burst.
        if (!shiftByStream.has(stream)) {
            shiftByStream.set(stream, Math.max(0, now - requested));
        }
        const shifted = requested + (shiftByStream.get(stream) ?? 0);
        const releaseAt = Math.max(shifted, (releaseByStream.get(stream) ?? 0) + 1);
        releaseByStream.set(stream, releaseAt);
        return [{
            updateOne: {
                filter: { _id: item._id },
                update: { $set: { releaseAt: new Date(releaseAt) } },
            },
        }];
    });

    if (operations.length) await queue().bulkWrite(operations);
    lastReleaseByStream.clear();
    for (const [stream, releaseAt] of releaseByStream) {
        lastReleaseByStream.set(stream, releaseAt);
    }
    await releaseDueEvents();
}

/** Persists a new delay and immediately applies it to the pending queue. */
export async function updateSpectatorDelayMs(delayMs: number): Promise<number> {
    const normalized = await setSpectatorDelayMs(delayMs);
    await reschedulePendingEvents(normalized);
    return normalized;
}

export async function emitWithSpectatorDelay(event: string, payload: unknown, options: BroadcastOptions = {}): Promise<void> {
    const scope = options.scope ?? "global";
    emitToAudience("admin", event, payload, scope, options.gameID);

    const delayMs = await getSpectatorDelayMs();
    const item: DelayedBroadcast = {
        event,
        payload,
        scope,
        gameID: options.gameID,
        releaseAt: nextReleaseAt(delayMs, options),
        createdAt: new Date(),
        publicGame: options.publicGame ? withoutMongoId(options.publicGame) : undefined,
        removePublicGameID: options.removePublicGameID,
    };

    if (delayMs === 0) {
        await release(item);
        return;
    }
    await queue().insertOne(item);
}

export async function ensurePublicGameSnapshot(game: GameDoc): Promise<void> {
    if (!game.gameID) return;
    await publicGames().updateOne(
        { gameID: game.gameID },
        { $setOnInsert: withoutMongoId(game) },
        { upsert: true },
    );
}

export async function getPublicGameSnapshots(): Promise<GameDoc[]> {
    const snapshots = await publicGames()
        .find({})
        .sort({ updateAt: -1, lastMoveAt: -1, createdAt: -1, _id: -1 })
        .toArray();
    const seenBoards = new Set<string>();
    return snapshots.filter((game) => {
        const boardKey = typeof game.boardID === "string" ? game.boardID.trim().toLowerCase() : "";
        if (!boardKey) return true;
        if (seenBoards.has(boardKey)) return false;
        seenBoards.add(boardKey);
        return true;
    });
}

export async function getPublicGameSnapshot(gameID: string): Promise<GameDoc | null> {
    return publicGames().findOne({ gameID });
}

export async function removePublicGameSnapshots(gameIDs: string[], boardID?: string): Promise<void> {
    const normalized = gameIDs.filter((gameID) => typeof gameID === "string" && gameID.length > 0);
    if (normalized.length) await publicGames().deleteMany({ gameID: { $in: normalized } });
    const normalizedBoardID = typeof boardID === "string" ? boardID.trim() : "";
    if (normalizedBoardID) await publicGames().deleteMany({ boardID: normalizedBoardID });
}

/**
 * Queues public removal on the spectator timeline. Events received before a
 * board went offline therefore remain visible in order before its card is
 * removed. Snapshot IDs are captured now so a later replacement game on the
 * same physical board cannot be deleted by this older cleanup event.
 */
export async function schedulePublicBoardCleanup(boardID: string, gameIDs: string[]): Promise<void> {
    const normalizedBoardID = boardID.trim();
    const snapshotIDs = normalizedBoardID
        ? await publicGames()
            .find({ boardID: normalizedBoardID })
            .project<{ gameID?: string }>({ gameID: 1, _id: 0 })
            .toArray()
        : [];
    const normalizedGameIDs = Array.from(new Set([
        ...gameIDs,
        ...snapshotIDs.map((snapshot) => snapshot.gameID),
    ].filter((gameID): gameID is string => typeof gameID === "string" && gameID.length > 0)));

    if (!normalizedGameIDs.length) return;

    const delayMs = await getSpectatorDelayMs();
    const streamGameID = normalizedGameIDs[0];
    const item: DelayedBroadcast = {
        event: "game:destroyed",
        payload: { gameIDs: normalizedGameIDs },
        scope: "global",
        gameID: streamGameID,
        releaseAt: nextReleaseAt(delayMs, { gameID: streamGameID }),
        createdAt: new Date(),
        removePublicGameIDs: normalizedGameIDs,
    };

    if (delayMs === 0) {
        await release(item);
        return;
    }
    await queue().insertOne(item);
}

export async function startSpectatorDelayService(): Promise<void> {
    await queue().createIndex({ releaseAt: 1, createdAt: 1 });
    await publicGames().createIndex({ gameID: 1 }, { unique: true });
    const liveGames = await getAllGame();
    for (const game of liveGames ?? []) await ensurePublicGameSnapshot(game);
    await reschedulePendingEvents(await getSpectatorDelayMs());
    if (!worker) worker = setInterval(() => void releaseDueEvents(), 100);
    worker.unref?.();
}
