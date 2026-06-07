import express from "express";
import { restorefromDB } from "../game/game.manager.js";
import { endGame, finishGame, getPGNCollections, getGame, saveGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";
import { Chess } from "chess.js";
import { ObjectId } from "mongodb";
import { GameActionController } from "../controllers/game.action.controller.js";
import { GameController } from "../controllers/game.controller.js";
import { emitGameState, gameState } from "../game/game.state.js";
import { LogController } from "../controllers/log.controller.js";
import { ERROR_STATUS, GAME_STATUS } from "../constant.js";

export const gameRouter = express.Router();

/**
 * POST /games/current
 * This api used to get current game(F5)
 */
gameRouter.get("/current", GameController.getCurrent);

/**
 * GET /games/history 
 * This api is used to get game played
*/
gameRouter.get("/history", GameController.getHistory);

/**GET  games/log
 * This api is used to get all log is saved
 */
gameRouter.get("/log", LogController.getLog);

/**
 * DELETE /games/history/:id 
 * This api is used to delete game played
*/
gameRouter.delete("/history/:id", GameController.deleteHistory);

/**
 * GET games/:id
 * This api is used to get single game by id
 */
gameRouter.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const game = await getGame(id);
        if (!game) {
            return res.status(404).json({ error: "Game not found" });
        }

        res.json(game);
    } catch (e) {
        console.log(e);
    }
});

/**
 * POST games/:id/pgn
 * This api is used to post edit pgn to server
 */
gameRouter.post("/:id/pgn", async (req, res) => {
    try {
        const { pgn, fen, lastMove } = req.body;
        const gameID = req.params.id;

        //update lastSeq
        const chess = new Chess();
        chess.loadPgn(pgn);
        const lastSeq = chess.history().length;

        await saveGame(gameID, { pgn, fen, lastMove, gameID, lastSeq });

        console.log("Before delete - gameSeq:", gameSeq.get(gameID));
        // Restore to update state after edit
        await restorefromDB(gameID);
        gameSeq.set(gameID, lastSeq);
        console.log("After delete - gameSeq:", gameSeq.get(gameID));
        res.json({ ok: true });
    } catch (e) {
        console.error("POST /pgn error: ", e);
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST games/:id/restart
 * This api is used to post restart game
 */
gameRouter.post("/:id/restart", GameActionController.restart);

/**
 * POST games/:id/destroy
 * This api is used to post destroy game
 */
gameRouter.post("/:id/destroy", GameActionController.destroy);

/**
 * POST games/:id/resign
 * This api is used to post Resign game
 * Body: {resignSide}
 * Response 200: { status: OK, oldGameID, newGameID, loser, winner }
 * Response 400, 404, 500: { error};
 */
gameRouter.post("/:id/resign", GameActionController.resign);

/**
 * POST games/:id/reset
 * This api is used to post reset board when the game end 
 */
gameRouter.post("/:id/reset", GameActionController.reset);

/**
 * POST games/:id/rename
 * This api is used to post rename player
 */
gameRouter.post("/:id/rename", GameActionController.rename);

/**
 * POST games/:id/endgame
 * This api is used to post endgame 
 */
gameRouter.post("/:id/endgame", async (req, res) => {
    try {
        const gameID = req.params.id;
        const { pgn } = req.body;

        if (!pgn) {
            return res.status(400).json({ error: "PGN required" });
        }
        const chess = new Chess();
        chess.loadPgn(pgn);
        const header = chess.getHeaders();

        const doc = {
            gameID,
            pgn,
            Result: header.Result || "*",
            White: header.White || "White",
            Black: header.Black || "Black",
            Date: header.Date || "",
            totalMoves: chess.history().length,
            createAt: new Date()
        }

        await endGame(doc);

        res.json(doc);
    } catch (e) {
        console.log("End game error: ", e);
    }
});

/**
 * GET games/:id/initcheck
 * This api is used to get state of physic board
 * Response 200: 
 * { gameID: string,
 *   status: BOARD_STATUS,
 *   missingSquares: string[],
 *   extraSquares: string[],
 *   wrongPieceSquares: string[]
 * }
 * Error Response:
 * Status: 500
 * {
 *   status: ERROR_STATUS.SERVER_ERROR,
 *   error: string
 * }
 */
gameRouter.get("/:id/initcheck", GameController.initcheck);

/**PUT  games/:id/update
 * This api is used to update data
 */
gameRouter.put("/:id/update", async (req, res) => {
    try {
        const id = req.params.id;
        const { date, result, pgn } = req.body;
        if (!pgn) {
            return res.status(400).json({ error: "PGN required" });
        }

        const game = await finishGame(id, {
            date,
            result,
            pgn,
            status: "finished"
        });
        res.json(game);

    } catch (e) {

    }
});
