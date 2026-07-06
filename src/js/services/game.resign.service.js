import { Chess } from "chess.js";
import { endGame, getGame, saveGame } from "../models/game.model.js";
import { createGame, resetGame, setCurrentGame } from "../game/game.manager.js";
import { BOARD_TYPE, ERROR_STATUS, GAME_STATUS } from "../constant.js";
import { GameService } from "./game.service.js";
// import { finishGame } from "../../../../ChessServer/src/js/models/game.model.js";

function buildResultTag(resignSide) {
    const resultTag = resignSide === "draw" ? "1/2-1/2" : resignSide === "white" ? "0-1" : "1-0";
    return resultTag;
}

function buildFinalPGN(game, pgn, resultTag) {
    // rebuild PGN with headers
    const chess = new Chess();
    if (pgn) chess.loadPgn(pgn);

    chess.setHeader("White", game.WhiteName || "White");
    chess.setHeader("Black", game.BlackName || "Black");
    chess.setHeader("Result", resultTag);
    chess.setHeader("Date", new Date().toISOString().slice(0, 10).replace(/-/g, "."));

    return { chess, finalPGN: chess.pgn() };
}

export const GameResignService = {
    async handle(gameID, resignSide, boardType, branchId = null) {
        // Validate 
        if (!resignSide || !["white", "black", "draw"].includes(resignSide)) {
            throw new Error(ERROR_STATUS.RESIGN_ERROR);
        }

        // get current game
        const game = await getGame(gameID);
        if (!game) throw new Error(ERROR_STATUS.NOTFOUND);

        const winner = resignSide === "draw" ? null : resignSide === "white" ? "black" : "white";
        let pgn = game.pgn ?? "";

        if (branchId) {
            const branch = game.branches?.find((b) => b.id === branchId);

            if (!branch) {
                throw new Error("Branch not found");
            }

            pgn = branch.pgn ?? "";
        }

        const resultTag = buildResultTag(resignSide);
        const { chess, finalPGN } = buildFinalPGN(game, pgn, resultTag);
        const currentRound = game.round ?? 1;
        const nextRound = currentRound + 1;

        // Save to game played
        const doc = {
            gameID,
            pgn: finalPGN,
            totalMoves: chess.history().length,
            round: currentRound,
            uciHistory: game.uciHistory ?? [],
            fenHistory: game.fenHistory ?? [],
            createdAt: new Date(),
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
        }, { boardType });

        const newGameID = crypto.randomUUID();
        await GameService.create(game.boardID, newGameID, nextRound);

        console.log("saveGame result =", updateResult);

        return { status: "OK", oldGameID: gameID, newGameID, loser: resignSide, winner };
    }
}