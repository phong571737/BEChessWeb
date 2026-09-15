import type { Request, Response } from "express";
import { getHomeDisplaySettings, getSpectatorDelayMs, setHomeDisplaySettings } from "../models/broadcast-setting.model.js";
import { updateSpectatorDelayMs } from "../services/spectator-delay.service.js";
import { getIO } from "../sockets/index.js";

async function readSettings() {
    const [delayMs, display] = await Promise.all([
        getSpectatorDelayMs(),
        getHomeDisplaySettings(),
    ]);
    return { delayMs, ...display };
}

export const BroadcastSettingController = {
    async get(_req: Request, res: Response): Promise<void> {
        res.json(await readSettings());
    },

    async update(req: Request, res: Response): Promise<void> {
        const hasDelay = Object.prototype.hasOwnProperty.call(req.body ?? {}, "delaySeconds");
        const hasEvaluation = Object.prototype.hasOwnProperty.call(req.body ?? {}, "homeEvaluationVisible");
        const hasSuggestions = Object.prototype.hasOwnProperty.call(req.body ?? {}, "homeSuggestionsVisible");
        const hasBoardOrder = Object.prototype.hasOwnProperty.call(req.body ?? {}, "homeBoardOrder");
        if (!hasDelay && !hasEvaluation && !hasSuggestions && !hasBoardOrder) {
            res.status(400).json({ error: "No broadcast setting supplied" });
            return;
        }

        if (hasDelay) {
            const delaySeconds = Number(req.body.delaySeconds);
            if (!Number.isFinite(delaySeconds) || delaySeconds < 0 || delaySeconds > 3_600) {
                res.status(400).json({ error: "Invalid spectator delay" });
                return;
            }
            await updateSpectatorDelayMs(delaySeconds * 1_000);
        }

        if ((hasEvaluation && typeof req.body.homeEvaluationVisible !== "boolean")
            || (hasSuggestions && typeof req.body.homeSuggestionsVisible !== "boolean")) {
            res.status(400).json({ error: "Invalid home display setting" });
            return;
        }
        const boardOrder = hasBoardOrder ? req.body.homeBoardOrder : undefined;
        if (hasBoardOrder && (!Array.isArray(boardOrder)
            || boardOrder.length > 200
            || boardOrder.some((value: unknown) => typeof value !== "string" || !value.trim() || value.trim().length > 100))) {
            res.status(400).json({ error: "Invalid home board order" });
            return;
        }
        if (hasEvaluation || hasSuggestions || hasBoardOrder) {
            await setHomeDisplaySettings({
                ...(hasEvaluation ? { homeEvaluationVisible: req.body.homeEvaluationVisible } : {}),
                ...(hasSuggestions ? { homeSuggestionsVisible: req.body.homeSuggestionsVisible } : {}),
                ...(hasBoardOrder ? { homeBoardOrder: Array.from(new Set((boardOrder as string[]).map((value) => value.trim()))) } : {}),
            });
        }

        const settings = await readSettings();
        getIO().emit("broadcast_settings_updated", settings);
        res.json(settings);
    },
};
