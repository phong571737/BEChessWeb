import { Chess } from "chess.js";
import { endGame, loadGame, saveGame } from "../models/game.model.js";
import { resetGame } from "../game/game.manager.js";

export const GameResignService = {
    async handle(gameID, resignSide) {
        // close the old game
        await endLog(gameID, "resign");

        // create a new sesion
        const sessionId = await createNewGame(gameID);
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
        chess.setHeader("White", game.WhiteName || "White");
        chess.setHeader("Black", game.BlackName || "Black");
        chess.setHeader("Result", resignSide === "white" ? "0-1" : "1-0");
        chess.setHeader("Date", new Date().toISOString().split("T")[0]);
        const finalPGN = chess.pgn();

        // Save to game played
        const doc = {
            gameID,
            pgn: finalPGN,
            Result: resignSide === "white" ? "0-1" : "1-0",
            White: game.WhiteName || "White",
            Black: game.BlackName || "Black",
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
            sessionId,
            lastMove: null,
            lastSeq: 0
        })

        return { message: "Resign success", loser: resignSide, winner };
    }
}