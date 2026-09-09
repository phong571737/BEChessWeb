import { Document, ObjectId } from "mongodb";
import { getDB } from "../config/database.js";
import { getAllGame } from "../models/game.model.js";
import { getSpectatorDelayMs } from "../models/broadcast-setting.model.js";
import { getIO } from "../sockets/index.js";
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
    if (item.publicGame?.gameID) {
        const game = withoutMongoId(item.publicGame);
        if (game.clockStartedAt && ["playing", "active"].includes(game.status ?? "")) {
            game.clockStartedAt = item.releaseAt;
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
    io.to(`audience:${audience}`).emit(event, payload);
}

async function release(item: DelayedBroadcast): Promise<void> {
    await applyPublicState(item);
    emitToAudience("public", item.event, publicPayload(item), item.scope, item.gameID);
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
    return publicGames().find({}).toArray();
}

export async function getPublicGameSnapshot(gameID: string): Promise<GameDoc | null> {
    return publicGames().findOne({ gameID });
}

export async function removePublicGameSnapshots(gameIDs: string[]): Promise<void> {
    const normalized = gameIDs.filter((gameID) => typeof gameID === "string" && gameID.length > 0);
    if (normalized.length) await publicGames().deleteMany({ gameID: { $in: normalized } });
}

export async function startSpectatorDelayService(): Promise<void> {
    await queue().createIndex({ releaseAt: 1, createdAt: 1 });
    await publicGames().createIndex({ gameID: 1 }, { unique: true });
    const pending = await queue().find({}).project({ gameID: 1, releaseAt: 1 }).toArray();
    for (const item of pending) {
        const stream = typeof item.gameID === "string" ? item.gameID : "global";
        const timestamp = new Date(item.releaseAt).getTime();
        if (Number.isFinite(timestamp)) {
            lastReleaseByStream.set(stream, Math.max(timestamp, lastReleaseByStream.get(stream) ?? 0));
        }
    }
    const liveGames = await getAllGame();
    for (const game of liveGames ?? []) await ensurePublicGameSnapshot(game);
    await releaseDueEvents();
    if (!worker) worker = setInterval(() => void releaseDueEvents(), 100);
    worker.unref?.();
}
