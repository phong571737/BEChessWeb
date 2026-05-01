import { getLogCollections } from "../models/log.model.js";

export const LogController = {
    // get log of all game
    async getLog(req, res) {
        try {
            const games = await getLogCollections()
                .find({})
                .sort({ createAt: -1 }) // newest
                .toArray();

            res.json(games);
        } catch (e) {
            console.error(e);
        }
    },
}