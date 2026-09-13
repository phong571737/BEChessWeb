import { Collection } from "mongodb";
import { getDB } from "../config/database.js";

interface BroadcastSetting {
    _id: string;
    delayMs: number;
    updatedAt: Date;
}

const SETTING_ID = "spectator-delay";
const MAX_DELAY_MS = 60 * 60 * 1_000;

function settings(): Collection<BroadcastSetting> {
    return getDB().collection<BroadcastSetting>("broadcast_settings");
}

export async function getSpectatorDelayMs(): Promise<number> {
    const setting = await settings().findOne({ _id: SETTING_ID });
    const delayMs = Number(setting?.delayMs ?? 0);
    return Number.isFinite(delayMs) ? Math.min(MAX_DELAY_MS, Math.max(0, Math.round(delayMs))) : 0;
}

export async function setSpectatorDelayMs(delayMs: number): Promise<number> {
    const normalized = Math.min(MAX_DELAY_MS, Math.max(0, Math.round(delayMs)));
    await settings().updateOne(
        { _id: SETTING_ID },
        { $set: { delayMs: normalized, updatedAt: new Date() } },
        { upsert: true },
    );
    return normalized;
}
