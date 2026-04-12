import { getPGNCollections, loadAllGame } from "../models/game.model.js";
import { GameService } from "../services/game.service.js";

export const GameController = {
    // This function is used to create a new game
    async create(req, res) {
        try {
            const { gameID } = req.body;
            if (!gameID) {
                return res.status(400).json({
                    error: "gameID required"
                });
            }

            await GameService.create(gameID);

            res.json({ status: "Game created", gameID });
        } catch (e) {
            console.log(e);
        }
    },

    // Get current state
    async getCurrent(req, res) {
        try {
            const game = await loadAllGame();
            if (!game) {
                return res.json(null);
            }
            // console.log("Current game: ", game);
            res.json(game);
        } catch (e) {
            console.log(e);
        }
    },

    // get history of game
    async getHistory(req, res) {
        try {
            const games = await getPGNCollections()
                .find({})
                .sort({ createAt: -1 }) // newest
                .toArray();

            res.json(games);
        } catch (e) {
            console.error(e);
        }
    },

    // delete history of game
    async deleteHistory(req, res) {
        try {
            await getPGNCollections()
                .deleteOne({ _id: new ObjectId(req.params.id) });
            res.json({ success: true });
        } catch (e) {
            console.error(e);
        }
    }
}