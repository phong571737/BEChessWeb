import { Collection, Document } from "mongodb";
import { getDB } from "../config/database.js";

interface BoardUptimeDocument extends Document {
    boardID: string;
    online: boolean;
    currentOnlineSince?: Date | null;
    lastOnlineAt?: Date | null;
    lastOfflineAt?: Date | null;
    accumulatedOnlineMs: number;
    sessionCount: number;
}

interface BoardUptimeSessionDocument extends Document {
    boardID: string;
    onlineAt: Date;
    offlineAt?: Date | null;
    durationSec?: number | null;
    status: "online" | "offline";
}

export interface BoardUptimeSummary {
    boardID: string;
    online: boolean;
    onlineSince: Date | null;
    lastOnlineAt: Date | null;
    lastOfflineAt: Date | null;
    totalOnlineSec: number;
    sessionCount: number;
}

export interface BoardOnlineSession {
    boardID: string;
    onlineAt: Date;
    offlineAt: Date | null;
    durationSec: number;
    online: boolean;
}

const uptimeCollection = (): Collection<BoardUptimeDocument> =>
    getDB().collection<BoardUptimeDocument>("board_uptime");
const uptimeSessions = (): Collection<BoardUptimeSessionDocument> =>
    getDB().collection<BoardUptimeSessionDocument>("board_uptime_sessions");

/** Starts a persisted uptime session only when the board changes to online. */
export async function markBoardOnline(boardID: string, now = new Date()): Promise<void> {
    await uptimeCollection().updateOne(
        { boardID },
        {
            $setOnInsert: {
                boardID,
                online: false,
                currentOnlineSince: null,
                lastOnlineAt: null,
                lastOfflineAt: null,
                accumulatedOnlineMs: 0,
                sessionCount: 0,
            },
        },
        { upsert: true },
    );
    const transition = await uptimeCollection().updateOne(
        { boardID, online: { $ne: true } },
        [
            {
                $set: {
                    online: true,
                    currentOnlineSince: now,
                    lastOnlineAt: now,
                    sessionCount: { $add: [{ $ifNull: ["$sessionCount", 0] }, 1] },
                },
            },
        ],
    );
    if (transition.modifiedCount === 1) {
        await uptimeSessions().insertOne({ boardID, onlineAt: now, offlineAt: null, durationSec: null, status: "online" });
    }
}

/** Closes the current session once; repeated MQTT offline messages add no time. */
export async function markBoardOffline(boardID: string, now = new Date()): Promise<void> {
    const transition = await uptimeCollection().updateOne(
        { boardID, online: true, currentOnlineSince: { $type: "date" } },
        [
            {
                $set: {
                    accumulatedOnlineMs: {
                        $add: [
                            { $ifNull: ["$accumulatedOnlineMs", 0] },
                            { $max: [0, { $subtract: [now, "$currentOnlineSince"] }] },
                        ],
                    },
                    online: false,
                    currentOnlineSince: null,
                    lastOfflineAt: now,
                },
            },
        ],
    );
    if (transition.modifiedCount === 1) {
        await uptimeSessions().updateOne(
            { boardID, status: "online" },
            [
                {
                    $set: {
                        offlineAt: now,
                        durationSec: { $floor: { $divide: [{ $max: [0, { $subtract: [now, "$onlineAt"] }] }, 1_000] } },
                        status: "offline",
                    },
                },
            ],
        );
    }
}

/** Returns all-time totals, including the elapsed part of a currently open session. */
export async function getBoardUptimeSummaries(now = new Date()): Promise<BoardUptimeSummary[]> {
    const rows = await uptimeCollection().find({}).sort({ boardID: 1 }).toArray();
    return rows.map((row) => {
        const openSessionMs = row.online && row.currentOnlineSince instanceof Date
            ? Math.max(0, now.getTime() - row.currentOnlineSince.getTime())
            : 0;
        return {
            boardID: row.boardID,
            online: row.online === true,
            onlineSince: row.currentOnlineSince instanceof Date ? row.currentOnlineSince : null,
            lastOnlineAt: row.lastOnlineAt instanceof Date ? row.lastOnlineAt : null,
            lastOfflineAt: row.lastOfflineAt instanceof Date ? row.lastOfflineAt : null,
            totalOnlineSec: Math.floor((Math.max(0, row.accumulatedOnlineMs ?? 0) + openSessionMs) / 1_000),
            sessionCount: Math.max(0, row.sessionCount ?? 0),
        };
    });
}

/** Returns online intervals that overlap the requested reporting window. */
export async function getBoardOnlineSessions(
    since: Date,
    now = new Date(),
): Promise<BoardOnlineSession[]> {
    const rows = await uptimeSessions()
        .find({
            onlineAt: { $lte: now },
            $or: [
                { offlineAt: { $gte: since } },
                { offlineAt: null },
                { offlineAt: { $exists: false } },
            ],
        })
        .sort({ onlineAt: -1 })
        .limit(2_000)
        .toArray();

    return rows.flatMap((row) => {
        if (!(row.onlineAt instanceof Date)) return [];
        const offlineAt = row.offlineAt instanceof Date ? row.offlineAt : null;
        const endAt = offlineAt ?? now;
        return [{
            boardID: row.boardID,
            onlineAt: row.onlineAt,
            offlineAt,
            durationSec: Math.floor(Math.max(0, endAt.getTime() - row.onlineAt.getTime()) / 1_000),
            online: !offlineAt && row.status === "online",
        }];
    });
}
