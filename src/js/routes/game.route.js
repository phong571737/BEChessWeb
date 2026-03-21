import express from "express";
import { createGame, resetGame, gameSeq, games, restorefromDB } from "../game/game.manager.js";
import { endGame, finishGame, getPGNCollections, loadAllGame, loadGame, removeGame, saveGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";
import { Chess } from "chess.js";
import { checkInitialBoard } from "../services/board.service.js";
import { ObjectId } from "mongodb";

export const gameRouter = express.Router();

/**
 * POST /games
 *This api is used to create game
 */
gameRouter.post("/", async (req, res) => {
    try {
        const { gameID } = req.body;

        if (!gameID) {
            return res.status(400).json({
                error: "gameID required"
            });
        }
        const chess = createGame(gameID);
        await saveGame(gameID, {
            gameID,
            fen: chess.fen(),
            pgn: "",
            // Date: ,
            lastMove: null
        });

        getIO().emit("create_game", { gameID });

        res.json({
            status: "Game created", gameID
        });
    } catch (e) {
        console.log(e);
    }
});

/**
 * POST /games/current
 * This api used to get current game(F5)
 */
gameRouter.get("/current", async (req, res) => {
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
});

/**GET /games/history 
 * This api is used to get game played
*/
gameRouter.get("/history", async (req, res) => {
    try {
        const games = await getPGNCollections()
            .find({})
            .sort({ createAt: -1 }) // newest
            .toArray();

        res.json(games);
    } catch (e) {
        console.error(e);
    }
})

/**DELETE /games/history/:id 
 * This api is used to delete game played
*/
gameRouter.delete("/history/:id", async (req, res) => {
    try {
        await getPGNCollections()
            .deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (e) {
        console.error(e);
    }
})

/**GET games/:id
 * This api is used to get single game by id
 */
gameRouter.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const game = await loadGame(id);
        if (!game) {
            return res.status(404).json({ error: "Game not found" });
        }

        res.json(game);
    } catch (e) {
        console.log(e);
    }
});

/**POST games/:id/pgn
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
        console.log("After delete - gameSeq:", gameSeq.get(gameID));
        res.json({ ok: true });
    } catch (e) {
        console.error("POST /pgn error: ", e);
        res.status(500).json({ error: e.message });
    }
});

/**POST games/:id/restart
 * This api is used to post restart game
 */
gameRouter.post("/:id/restart", async (req, res) => {
    try {
        const gameID = req.params.id;
        console.log("Restart game:", gameID);

        //Reset game
        resetGame(gameID);

        await saveGame(gameID, {
            gameID,
            fen: new Chess().fen(),
            pgn: "",
            lastMove: null,
            lastSeq: 0
        });

        getIO().emit("game_restart", { gameID });
        res.json({ ok: true });
    } catch (e) {
        console.log("Restart error: ", e);
        res.status(500).json({ error: e.message });
    }
});

/**POST games/:id/destroy
 * This api is used to post destroy game
 */
gameRouter.post("/:id/destroy", async (req, res) => {
    try {
        const gameID = req.params.id;
        console.log("Destroy request: ", gameID);
        const result = await removeGame(gameID);
        res.json({
            result
        });
    } catch (e) {
        console.log("Remove game", e);
        res.status(500).json({ error: e.message });
    }
});

/**POST games/:id/resign
 * This api is used to post Resign game
 */
gameRouter.post("/:id/resign", async (req, res) => {
    try {
        const gameID = req.params.id;
        const { resignSide } = req.body;

        // Validate 
        if (!resignSide || !["white", "black"].includes(resignSide)) {
            return res.status(400).json({ error: "resignSide error" });
        }

        const game = await loadGame(gameID);

        if (!game) return res.status(404).json({ error: "Game not found" });
        const winner = resignSide === "white" ? "black" : "white";
        const chess = new Chess();
        const pgn = typeof game.pgn === "string" && game.pgn.trim() ? game.pgn : "";
        if (pgn) chess.loadPgn(pgn);

        // Save to game played
        const doc = {
            gameID,
            pgn: game.pgn || "",
            Result: resignSide === "white" ? "0-1" : "1-0",
            White: game.White || "White",
            Black: game.Black || "Black",
            Date: new Date().toISOString().split("T")[0],
            totalMoves: game.lastSeq,
            endReason: "resigned",
            loser: resignSide,
            winner,
            createAt: new Date(),
        }

        await endGame(doc);
        resetGame(gameID);
        await saveGame(gameID, {
            fen: new Chess().fen(),
            pgn: "",
            lastMove: null,
            lastSeq: 0
        })

        return res.status(200).json({
            message: "Resign success",
            loser: resignSide,
            winner: winner,
        });

    } catch (e) {
        console.log("Resign game", e);
        res.status(500).json({ error: e.message });
    }
});

/**POST games/:id/endgame
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

/**POST games/:id/reset
 * This api is used to post reset board when the game end 
 */
gameRouter.post("/:id/reset", async (req, res) => {
    try {
        const gameID = req.params.id;

        // Reset server 
        resetGame(gameID);
        await saveGame(req.params.id, {
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            pgn: "",
            lastMove: null,
            lastSeq: 0,
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST games/:id/initcheck
 * This api is used to check board initial or not
 */
gameRouter.post("/:id/initcheck", async (req, res) => {
    try {
        const gameID = req.params.id;
        const board = req.body.board;
        const result = checkInitialBoard(board);

        res.json({
            gameID,
            ...result
        });
    } catch (e) {
        console.log("Init check error", e);
    }
});

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
