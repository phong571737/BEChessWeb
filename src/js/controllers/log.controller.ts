import { getLogCollections } from "../models/log.model.js";
import { Request, Response } from "express";

export const LogController = {
    // get log of all game
    async getLog(req: Request, res: Response): Promise<void> {
        try {
            const games = await getLogCollections()
                .find({})
                .sort({ startedAt: -1 }) // newest
                .toArray();

            res.json(games);
        } catch (e) {
            console.error(e);
        }
    },
}