import { Request, Response } from "express";
import { getPGNCollections, getAllGame, moveHistoryToTrash, permanentlyDeleteHistoryFromTrash, restoreHistoryFromTrash } from "../models/game.model.js";
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
                .find({ deletedAt: { $exists: false } })
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
            const moved = await moveHistoryToTrash(req.params.id);
            if (!moved) {
                res.status(404).json({ error: "History record not found or already in trash" });
                return;
            }
            res.json({ success: true, retentionDays: 30 });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Unable to move history to trash" });
        }
    },

    async getHistoryTrash(_req: Request, res: Response): Promise<void> {
        try {
            const games = await getPGNCollections()
                .find({ deletedAt: { $exists: true } })
                .sort({ deletedAt: -1 })
                .toArray();
            res.json(games);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Unable to load history trash" });
        }
    },

    async restoreHistory(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            const restored = await restoreHistoryFromTrash(req.params.id);
            if (!restored) {
                res.status(404).json({ error: "Trashed history record not found" });
                return;
            }
            res.json({ success: true });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Unable to restore history" });
        }
    },

    async permanentlyDeleteHistory(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            const deleted = await permanentlyDeleteHistoryFromTrash(req.params.id);
            if (!deleted) {
                res.status(404).json({ error: "Trashed history record not found" });
                return;
            }
            res.json({ success: true });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Unable to permanently delete history" });
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
                    buttonReady: false,
                    missingSquares: [],
                    extraSquares: [],
                    wrongPieceSquares: [],
                })
            }

            // current initcheck state
            return res.status(200).json({
                gameID,
                status: state.initResultStatus ?? state.gameStatus,
                buttonReady: state.buttonReady === true,
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
