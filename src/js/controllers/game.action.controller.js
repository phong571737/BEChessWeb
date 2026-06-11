import { GameActionService } from "../services/game.action.service.js";
import { GameResignService } from "../services/game.resign.service.js";

export const GameActionController = {
    // resign action
    async resign(req, res) {
        try {
            const gameID = req.params.id;
            const { resignSide, boardType } = req.body;
            const result = await GameResignService.handle(gameID, resignSide, boardType);
            res.json(result);
        } catch (e) {
            const status = e.message === "Game not found" ? 404
                : e.message === "resignSide error" ? 400
                    : 500;
            res.status(status).json({ error: e.message });
        }
    },

    // restart action
    async restart(req, res) {
        try {
            const gameID = req.params.id;
            console.log("Restart game:", gameID);
            await GameActionService.restart(gameID);
            res.json({ ok: true });
        } catch (e) {
            console.log("Restart error: ", e);
            res.status(500).json({ error: e.message });
        }
    },

    // destroy action
    async destroy(req, res) {
        try {
            const gameID = req.params.id;
            console.log("Destroy request: ", gameID);
            const result = await GameActionService.destroy(gameID);
            res.json({
                result
            });
        } catch (e) {
            console.log("Remove game", e);
            res.status(500).json({ error: e.message });
        }
    },

    async rename(req, res) {
        try {
            const gameID = req.params.id;
            const {color, name} = req.body;

            await GameActionService.rename(gameID, color, name);

            res.json({
                ok: true
            });
        } catch (e) {
            console.log("Rename failed", e);
            res.status(500).json ({error: e.message});
        }
    },

    // reset action
    async reset(req, res) {
        try {
        const gameID = req.params.id;
        
        await GameActionService.reset(gameID);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
    }
}