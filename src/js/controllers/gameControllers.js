import { LoadGameFromDB } from "../services/gameServices.js";

export async function restoreGame(req, res) {
    const game = LoadGameFromDB();
    res.json(game);
}