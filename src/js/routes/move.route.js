import express from "express";
import {askPromotion, games, makeMove, restorefromDB} from "../game/game.manager.js";
import { saveGame } from "../models/game.model.js";
import {getIO} from "../sockets/index.js";

export const moveRouter = express.Router();

/**
 * POST /moves
 * This api is used to send move
*/
moveRouter.post("/", async(req, res) =>{
    try{
        const {uci, gameID, seq} = req.body;
        console.log("Move from Esp", uci, gameID);
        
        let game = games.get(gameID);
        if (!game) {
            game = await restorefromDB(gameID);
        }

        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const piece = game?.get(from);

        const isPromotion = piece?.type === "p" && (
            (piece.color === "w" && to[1] === "8") ||
            (piece.color === "b" && to[1] === "1")
        );

        let fullUCI = uci;
        if (isPromotion) {
            //Ask webserver select piece
            // const promotion = await askPromotion(gameID, to);
            const promotion = 'q';
            fullUCI = uci + promotion; //e7e8q or e7e8r
        }

        const state = await makeMove(gameID, fullUCI, seq);

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