import { Collection } from "mongodb";
import { getDB } from "../config/database.js";

interface BroadcastSetting {
    _id: string;
    delayMs: number;
    homeEvaluationVisible?: boolean;
    homeSuggestionsVisible?: boolean;
    homeBoardOrder?: string[];
    updatedAt: Date;
}

export interface HomeDisplaySettings {
    homeEvaluationVisible: boolean;
    homeSuggestionsVisible: boolean;
    homeBoardOrder: string[];
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

export async function getHomeDisplaySettings(): Promise<HomeDisplaySettings> {
    const setting = await settings().findOne({ _id: SETTING_ID });
    return {
        homeEvaluationVisible: setting?.homeEvaluationVisible !== false,
        homeSuggestionsVisible: setting?.homeSuggestionsVisible !== false,
        homeBoardOrder: Array.isArray(setting?.homeBoardOrder) ? setting.homeBoardOrder : [],
    };
}

export async function setHomeDisplaySettings(
    patch: Partial<HomeDisplaySettings>,
): Promise<HomeDisplaySettings> {
    const updates: Partial<BroadcastSetting> = { updatedAt: new Date() };
    if (typeof patch.homeEvaluationVisible === "boolean") {
        updates.homeEvaluationVisible = patch.homeEvaluationVisible;
    }
    if (typeof patch.homeSuggestionsVisible === "boolean") {
        updates.homeSuggestionsVisible = patch.homeSuggestionsVisible;
    }
    if (Array.isArray(patch.homeBoardOrder)) {
        updates.homeBoardOrder = patch.homeBoardOrder;
    }
    await settings().updateOne(
        { _id: SETTING_ID },
        { $set: updates },
        { upsert: true },
    );
    return getHomeDisplaySettings();
}
