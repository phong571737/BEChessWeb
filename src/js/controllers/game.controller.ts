import { Request, Response } from "express";
import { getPGNCollections, getAllGame } from "../models/game.model.js";
import { ERROR_STATUS, GAME_STATUS } from "../constant.js";
import { gameState } from "../game/game.state.js";
import { GameIdParams } from "../types/game.types.js";
import { ObjectId } from "mongodb";
import { getBoardIDByGame } from "../game/game.manager.js";

export const GameController = {
    // Get current state
    async getCurrent(req: Request, res: Response): Promise<void> {
        try {
            const game = await getAllGame();
            if (!game) {
                res.json(null);
                return;
            }
            res.json(game);
        } catch (e) {
            console.log(e);
        }
    },

    // get history of game
    async getHistory(req: Request, res: Response): Promise<void> {
        try {
            const games = await getPGNCollections()
                .find({})
                .sort({ createdAt: -1 }) // newest
                .toArray();

            res.json(games);
        } catch (e) {
            console.error(e);
        }
    },

    // delete history of game
    async deleteHistory(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            await getPGNCollections()
                .deleteOne({ _id: new ObjectId(req.params.id) });
            res.json({ success: true });
        } catch (e) {
            console.error(e);
        }
    },

    // get state initcheck
    async initcheck(req: Request<GameIdParams>, res: Response): Promise<Response | void> {
        try {
            const gameID = req.params.id;
            const boardID = getBoardIDByGame(gameID);
            const state = boardID ? gameState.get(boardID) : undefined;

            // no state yet
            if (!state) {
                return res.status(200).json({
                    gameID,
                    status: GAME_STATUS.WAITING,
                    missingSquares: [],
                    extraSquares: [],
                    wrongPieceSquares: [],
                })
            }

            // current initcheck state
            return res.status(200).json({
                gameID,
                status: state.gameStatus,
                missingSquares: state.missingSquares || [],
                extraSquares: state.extraSquares || [],
                wrongPieceSquares: state.wrongPieceSquares || [],
            });
        } catch (e) {
            console.log("Init check error", e);

            return res.status(500).json({
                status: ERROR_STATUS.SERVER_ERROR,
            });
        }
    },
}