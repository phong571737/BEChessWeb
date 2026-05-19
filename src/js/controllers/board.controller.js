import { GameService } from "../services/game.service.js";
import { loadAllGame } from "../models/game.model.js";

export const BoardController = {
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

    // Get current game 
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
}