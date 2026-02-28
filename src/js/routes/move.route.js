import express from "express";
import {makeMove} from "../game/game.manager.js";
import { saveGame } from "../models/gameModels.js";
import {getIO} from "../sockets/index.js";

export const moveRouter = express.Router();

/**
 * POST /moves
 * Send move
*/
moveRouter.post("/", async(req, res) =>{
    try{
        const {uci, gameID, seq} = req.body;
        console.log("Move from Esp", uci, gameID);

        const state = await makeMove(gameID, uci, seq);

        if(state.duplicate){
            return res.json({
                status: "duplicated",
                lastSeq: state.lastSeq,
            });
        }

        await saveGame(gameID, state); //reload

        /**send to web */
        getIO().emit("esp_move", state);
        res.json({
            status: "ok",
            lastSeq: res.lastSeq,
        });
    }catch (err){
        res.status(400).json({error: err.message });
    }
});