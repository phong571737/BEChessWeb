import express from "express";
import {games, makeMove, restorefromDB} from "../game/game.manager.js";
import { saveGame } from "../models/game.model.js";
import {getIO} from "../sockets/index.js";

export const moveRouter = express.Router();

/**
 * POST /moves
 * This api is used to send move
*/
moveRouter.post("/", async(req, res) =>{
    try{
        const {uci, start, end, gameID, seq} = req.body;
        console.log("Move from Esp", uci, gameID);

        let candidates = [];
        if (start === "MULTI" && end) {
            candidates = end.split(",");
        }else if (uci && uci.startsWith("MULTI")) {
            candidates = uci.replace("MULTI:", "").replace("MULTI", "").split(",");
        }else if (uci && uci.includes(",")) {
            candidates = uci.split(",");
        }else if (uci) {
            candidates = [uci];
        } else {
            return res.status(400).json({
                status: "invalid_request", 
                message: "Missing move data"
            })
        }

        const state = await makeMove(gameID, candidates, seq);

        if(state.status != "ok") return res.json(state);

        await saveGame(gameID, state); //reload

        /**send to web */
        getIO().emit("esp_move", state);
        res.json(state);
    }catch (err){
        console.error("System error", err);

        res.status(500).json({
            status: "server_error",
            message: "Internal server error"
        });
    }
});