import { Chess } from "chess.js";
import { endGame, getGame, saveGame } from "../models/game.model.js";
import { resetGame } from "../game/game.manager.js";
import { createNewGame, endLog } from "../models/log.model.js";
import { BOARD_TYPE, ERROR_STATUS, GAME_STATUS } from "../constant.js";
import { GameService } from "./game.service.js";

export const GameResignService = {
    async handle(gameID, resignSide, boardType) {
        // close the old game
        await endLog(gameID, "resign");

        // Validate 
        if (!resignSide || !["white", "black", "draw"].includes(resignSide)) {
            throw new Error(ERROR_STATUS.RESIGN_ERROR);
        }

        // get current game
        const game = await getGame(gameID);
        if (!game) throw new Error(ERROR_STATUS.NOTFOUND);

        const winner = resignSide === "draw" ? null : resignSide === "white" ? "black" : "white";
        
        // rebuild PGN with headers
        const chess = new Chess();
        const pgn = typeof game.pgn === "string" && game.pgn.trim() ? game.pgn : "";
        if (pgn) chess.loadPgn(pgn);

        const resultTag = resignSide === "draw" ? "1/2-1/2" : resignSide === "white" ? "0-1" : "1-0";
        const now = new Date();
        const dateTag = now.toISOString().slice(0, 10).replace(/-/g, "");

        chess.setHeader("White", game.WhiteName || "White");
        chess.setHeader("Black", game.BlackName || "Black");
        chess.setHeader("Result", resultTag);
        chess.setHeader("Date", dateTag);
        const finalPGN = chess.pgn();

        const currentRound = game.round ?? 1;
        const nextRound = currentRound + 1;

        // Save to game played
        const doc = {
            gameID,
            pgn: finalPGN,
            Result: resultTag,
            White: game.WhiteName || "White",
            Black: game.BlackName || "Black",
            Date: new Date().toISOString().split("T")[0],
            totalMoves: game.lastSeq ?? 0,
            endReason: resignSide === "draw" ? "draw_agreed" : "resigned",
            loser: resignSide === "draw" ? null : resignSide,
            winner,
            round: currentRound,
            uciHistory: game.uciHistory ?? [],
            fenHistory: game.fenHistory ?? [],
            createAt: new Date(),
        }

        await endGame(doc);

        resetGame(gameID);

        const updateResult = await saveGame(gameID, {
            fen: new Chess().fen(),
            pgn: "",
            lastMove: null,
            lastSeq: 0, 
            status: GAME_STATUS.FINISHED,
            result: resultTag,
            round: nextRound,
            uciHistory: [], // reset
            fenHistory: [],
        }, {boardType});

        const newGameID = crypto.randomUUID();
        await GameService.create(game.boardID, newGameID, nextRound);

        console.log("saveGame result =", updateResult);

        return { status: "OK" , oldGameID: gameID, newGameID, loser: resignSide, winner };
    }
}