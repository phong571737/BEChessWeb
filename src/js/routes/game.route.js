import express from "express";
import { createGame } from "../game/game.manager.js";
import { loadAllGame } from "../models/gameModels.js";
import {getIO} from "../sockets/index.js";

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