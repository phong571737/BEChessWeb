import express from "express";
import {makeMove} from "../game/game.manager.js";
import { saveGame } from "../models/game.model.js";
import {getIO} from "../sockets/index.js";
import { stockfishService } from "../services/stockfish.instance.js";
import { invalidateCached } from "../utils/response.cache.js";

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
        if (state.status !== "ok") return res.json(state);

        // Stamp the exact server-side time so clients can derive thinking-time
        // accurately even after a page reload.
        state.movedAt = Date.now();

        await saveGame(gameID, state);

        // Bust the REST cache so new page-loads always get movedAt immediately
        invalidateCached(`games:item:${gameID}`);

        // Push full move state to clients watching this specific game
        getIO().to(gameID).emit("esp_move", state);

        // Broadcast a lightweight update to ALL connected clients so home-page
        // game cards can sync FEN/lastMove without joining the game room.
        getIO().emit("game:move", { gameID, fen: state.fen, lastMove: state.lastMove ?? null });

        // Kick off Stockfish eval — streams cp updates via eval_update event
        stockfishService.evaluate(state.fen, (cp) => {
            getIO().to(gameID).emit("eval_update", { gameID, cp });
        }).catch((err) => {
            console.error("[/moves] stockfish error:", err.message);
        });

        res.json(state);
    }catch (err){
        console.error("System error", err);

        res.status(500).json({
            status: "server_error",
            message: "Internal server error"
        });
    }
});