import express from "express";
import { createGame, resetGame } from "../game/game.manager.js";
import { endGame, finishGame, loadAllGame, loadGame, removeGame, saveGame } from "../models/game.model.js";
import {getIO} from "../sockets/index.js";
import { Chess } from "chess.js";
import { checkInitialBoard } from "../services/board.service.js";

export const gameRouter = express.Router();

/**
 * POST /games
 *This api is used to create game
 */
gameRouter.post("/", async(req, res)=>{
    try{
        const {gameID} = req.body;

        if(!gameID){
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
 * This api used to get current game(F5)
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
 * This api is used to get single game by id
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
 * This api is used to post edit pgn to server
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
 * This api is used to post restart game
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

/**POST games/:id/destroy
 * This api is used to post destroy game
 */
gameRouter.post("/:id/destroy", async (req, res) =>{
    try{
        const gameID = req.params.id;
        console.log("Destroy request: ", gameID);
        const result = await removeGame(gameID);
        res.json({
            result
        });
    }catch(e){
        console.log("Remove game", e);
        res.status(500).json({error: e.message});
    }
});

/**POST games/:id/resign
 * This api is used to post Resign game
 */
gameRouter.post("/:id/resign", async (req, res) =>{
    try{
        
    }catch(e){
        console.log("Resign game", e);
        res.status(500).json({error: e.message});
    }
});

/**POST games/:id/endgame
 * This api is used to post endgame 
 */
gameRouter.post("/:id/endgame", async (req, res) =>{
    try{
        const gameID = req.params.id;
        const {pgn} = req.body;

        if(!pgn){
            return res.status(400).json({error: "PGN required"});
        }

        const result = await endGame(pgn);

        res.json(result);
    }catch (e){
        console.log("End game error: ", e);
    }
});

/**
 * POST games/:id/initcheck
 * This api is used to check board initial or not
 */
gameRouter.post("/:id/initcheck", async (req, res) =>{
    try{
        const gameID = req.params.id;
        const board = req.body.board;
        const result = checkInitialBoard(board);

        res.json({
            gameID, 
            ...result
        });
    }catch(e){
        console.log("Init check error", e);
    }
});

/**PUT  games/:id/update
 * This api is used to update data
 */
gameRouter.put("/:id/update", async (req, res) =>{
    try{
        const id = req.params.id;
        const {date, result, pgn} = req.body;
        if(!pgn){
            return res.status(400).json({error: "PGN required"});
        }

        const game = await finishGame(id,  {
            date,
            result,
            pgn,
            status: "finished"
        });
        res.json(game);

    }catch(e){

    }
});