import express from "express";
import { createGame, resetGame } from "../game/game.manager.js";
import { loadAllGame, loadGame, saveGame } from "../models/gameModels.js";
import {getIO} from "../sockets/index.js";
import { Chess } from "chess.js";

export const gameRouter = express.Router();

/**
 * POST /games
 * create game
 */
gameRouter.post("/", async(req, res)=>{
    try{
        const {gameID} = req.body;

        if(!gameID){
            return res.status(400).json({
                error: "gameID required"
            });
        }
        console.log("Create Game", gameID);
        createGame(gameID);
        getIO().emit("create_game", {gameID});

        res.json({
            status: "Game created", gameID
        });
    }catch(e){
        console.log(e);
    }
});

/**
 * POST /games/current
 * Get current game(F5)
 */
gameRouter.get("/current", async(req, res)=>{
    try{
        const game = await loadAllGame();
        if(!game){
            return res.json(null);
        }
        console.log("Current game: ", game);
        res.json(game);
    }catch(e){
        console.log(e);
    }
});

/**GET games/:id
 * Get single game by id
 */

gameRouter.get("/:id", async(req, res) =>{
    try{
        const {id} = req.params;
        const game = await loadGame(id);
        if(!game){
            return res.status(404).json({error: "Game not found"});
        }

        res.json(game);
    }catch (e){
        console.log(e);
    }
});

/**POST games/:id/pgn
 * Post edit pgn to server
 */
gameRouter.post("/:id/pgn", async(req, res) => {
    try{
        const {pgn, fen, lastMove} = req.body;
        const gameID = req.params.id;

        //update lastSeq
        const chess = new Chess();
        chess.loadPgn(pgn);
        const lastSeq = chess.history().length;

        await saveGame(gameID, {pgn, fen, lastMove, gameID, lastSeq});
        res.json({ok: true});
    }catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**POST games/:id/restart
 * Post restart game
 */
gameRouter.post("/:id/restart", async(req, res) =>{
    try{
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

        getIO().emit("game_restart", {gameID});
        res.json({ok: true});
    }catch (e){
        console.log("Restart error: ", e);
        res.status(500).json({error: e.message});
    }
});

/**POST games/:id/remove
 * Post remove game
 */
gameRouter.post("/:id/remove", async (req, res) =>{
    try{

    }catch(e){
        console.log("Remove game", e);
        res.status(500).json({error: e.message});
    }
});

/**POST games/:id/resign
 * Post Resign game
 */
gameRouter.post("/:id/resign", async (req, res) =>{
    try{
        
    }catch(e){
        console.log("Resign game", e);
        res.status(500).json({error: e.message});
    }
});