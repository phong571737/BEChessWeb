import type { Request, Response } from "express";
import { getSpectatorDelayMs, setSpectatorDelayMs } from "../models/broadcast-setting.model.js";

export const BroadcastSettingController = {
    async get(_req: Request, res: Response): Promise<void> {
        res.json({ delayMs: await getSpectatorDelayMs() });
    },

    async update(req: Request, res: Response): Promise<void> {
        const delaySeconds = Number(req.body?.delaySeconds);
        if (!Number.isFinite(delaySeconds) || delaySeconds < 0 || delaySeconds > 3_600) {
            res.status(400).json({ error: "Invalid spectator delay" });
            return;
        }
        const delayMs = await setSpectatorDelayMs(delaySeconds * 1_000);
        res.json({ delayMs });
    },
};
