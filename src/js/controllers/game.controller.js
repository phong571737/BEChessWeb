import { LoadGameFromDB } from "../services/game.service.js";

export async function restoreGame(req, res) {
    const game = LoadGameFromDB();
    res.json(game);
}