import express from "express";
import {createGame, makeMove} from "../game/game.manager.js";
import {loadGame, saveGame} from "../db/game.repositories.js";
import {getIO} from "../sockets/index.js";
import { error } from "console";

export const router = express.Router();

/**router send move */
router.post("/", async(req, res) =>{
    try{
        const {uci, gameID} = req.body;
        console.log("Move from Esp", uci, gameID);

        const state = makeMove(gameID, uci);
        await saveGame(state); //reload

        /**send to web */
        getIO().emit("esp_move", state);
        res.json({
            status: "ok"
        });
    }catch (err){
        res.status(400).json({error: err.message });
    }
});

router.get("/current", async(req, res)=>{
    try{
        const game = await loadGame();
        if(!game){
            return res.json(null);
        }
        console.log("Current game: ", game);
        res.json(game);
    }catch(e){
        console.log(e);
    }
});

router.post("/create", async(req, res)=>{
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