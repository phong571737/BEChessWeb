import { Collection, Document } from "mongodb";
import { getDB } from "../config/database.js";

interface BoardUptimeDocument extends Document {
    boardID: string;
    online: boolean;
    currentOnlineSince?: Date | null;
    lastOnlineAt?: Date | null;
    lastOfflineAt?: Date | null;
    accumulatedOnlineMs: number;
    accumulatedOfflineMs: number;
    sessionCount: number;
}

export interface BoardUptimeSummary {
    boardID: string;
    online: boolean;
    onlineSince: Date | null;
    lastOnlineAt: Date | null;
    lastOfflineAt: Date | null;
    totalOnlineSec: number;
    totalOfflineSec: number;
    sessionCount: number;
}

const uptimeCollection = (): Collection<BoardUptimeDocument> =>
    getDB().collection<BoardUptimeDocument>("board_uptime");
const uptimeSessions = (): Collection<Document> =>
    getDB().collection("board_uptime_sessions");

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
                accumulatedOfflineMs: 0,
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
                    accumulatedOfflineMs: {
                        $add: [
                            { $ifNull: ["$accumulatedOfflineMs", 0] },
                            {
                                $cond: [
                                    { $eq: [{ $type: "$lastOfflineAt" }, "date"] },
                                    { $max: [0, { $subtract: [now, "$lastOfflineAt"] }] },
                                    0,
                                ],
                            },
                        ],
                    },
                    online: true,
                    currentOnlineSince: now,
                    lastOnlineAt: now,
                    sessionCount: { $add: [{ $ifNull: ["$sessionCount", 0] }, 1] },
                },
            },
        ],
    );
    if (transition.modifiedCount === 1) {
        const previousSession = await uptimeSessions()
            .find({ boardID, status: "offline", nextOnlineAt: { $exists: false } })
            .sort({ offlineAt: -1 })
            .limit(1)
            .next();
        if (previousSession?._id && previousSession.offlineAt instanceof Date) {
            await uptimeSessions().updateOne(
                { _id: previousSession._id },
                {
                    $set: {
                        nextOnlineAt: now,
                        offlineDurationSec: Math.floor(Math.max(0, now.getTime() - previousSession.offlineAt.getTime()) / 1_000),
                    },
                },
            );
        }
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
        const openOfflineMs = !row.online && row.lastOfflineAt instanceof Date
            ? Math.max(0, now.getTime() - row.lastOfflineAt.getTime())
            : 0;
        return {
            boardID: row.boardID,
            online: row.online === true,
            onlineSince: row.currentOnlineSince instanceof Date ? row.currentOnlineSince : null,
            lastOnlineAt: row.lastOnlineAt instanceof Date ? row.lastOnlineAt : null,
            lastOfflineAt: row.lastOfflineAt instanceof Date ? row.lastOfflineAt : null,
            totalOnlineSec: Math.floor((Math.max(0, row.accumulatedOnlineMs ?? 0) + openSessionMs) / 1_000),
            totalOfflineSec: Math.floor((Math.max(0, row.accumulatedOfflineMs ?? 0) + openOfflineMs) / 1_000),
            sessionCount: Math.max(0, row.sessionCount ?? 0),
        };
    });
}
