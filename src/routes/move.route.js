const express = require("express");
const {makeMove} = require("../game/game.manager");
const {saveGame} = require("../db/game.repositories");
const {getIO} = require("../socket")

const router = express.Router();

router.post("/", async(req, res) =>{
    try{
        const {uci} = req.body;
        console.log("Move from Esp", uci);

        const state = makeMove(uci);
        await saveGame(state); //reload

        /**send to web */
        getIO.emit("esp_move", state);
        res.json({
            status: "ok"
        });
    }catch (err){
        res.status(400).json({error: err.message });
    }
});

module.exports = {router};