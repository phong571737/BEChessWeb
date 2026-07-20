import { Chess } from "chess.js";
import { endGame, getGame, saveGame } from "../models/game.model.js";
import { resetGame } from "../game/game.manager.js";
import { ERROR_STATUS, GAME_STATUS } from "../constant.js";
import { GameService } from "./game.service.js";
import { GameDoc, ResignSide } from "../types/game.types.js";

interface ResignResult {
    status: "OK";
    oldGameID: string;
    newGameID: string;
    loser: ResignSide;
    winner: "white" | "black" | null;
}

function buildResultTag(resignSide: ResignSide) {
    const resultTag = resignSide === "draw" ? "1/2-1/2" : resignSide === "white" ? "0-1" : "1-0";
    return resultTag;
}

function buildFinalPGN(game: GameDoc, fen: string, resultTag: string): { chess: Chess, finalPGN: string } {
    // rebuild PGN with headers
    // const chess = new Chess();
    // if (pgn) chess.loadPgn(pgn);
    const chess = new Chess();
    try {
        if (fen) chess.load(fen, { skipValidation: true });
    } catch (e) {
        console.error("[RESIGN] Failed to load fen, using default position:", e);
    }

    chess.setHeader("White", game.WhiteName || "White");
    chess.setHeader("Black", game.BlackName || "Black");
    chess.setHeader("Result", resultTag);
    chess.setHeader("Date", new Date().toISOString().slice(0, 10).replace(/-/g, "."));

    return { chess, finalPGN: chess.pgn() };
}

export const GameResignService = {
    async handle(gameID: string, resignSide: ResignSide, boardType: string, branchId: string | null = null): Promise<ResignResult> {
        // Validate 
        if (!resignSide || !["white", "black", "draw"].includes(resignSide)) {
            throw new Error(ERROR_STATUS.RESIGN_ERROR);
        }

        // get current game
        const game = await getGame(gameID);
        if (!game) throw new Error(ERROR_STATUS.NOTFOUND);

        const winner = resignSide === "draw" ? null : resignSide === "white" ? "black" : "white";
        // let pgn = game.pgn ?? "";
        let fen = game.fen ?? "";
        let fenHistory = game.fenHistory ?? [];
        let uciHistory = game.uciHistory ?? [];

        if (branchId) {
            const branch = game.branches?.find((b) => b.id === branchId);
            if (!branch) {
                throw new Error("Branch not found");
            }
            // pgn = branch.pgn ?? "";
            fen = branch.fen ?? game.fen ?? "";
            fenHistory = (branch as any).fenHistory ?? game.fenHistory ?? [];
            uciHistory = (branch as any).uciHistory ?? game.uciHistory ?? [];
        }

        const resultTag = buildResultTag(resignSide);
        const { chess, finalPGN } = buildFinalPGN(game, fen, resultTag);
        const currentRound = game.round ?? 1;
        const nextRound = currentRound + 1;

        // Save to game played
        const doc = {
            gameID,
            pgn: finalPGN,
            totalMoves: fenHistory.length,
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
        if (!game.boardID) {
            throw new Error(`Game ${gameID} is missing boardID`);
        }
        await GameService.create(game.boardID, newGameID, nextRound);
        console.log("saveGame result =", updateResult);

        return { status: "OK", oldGameID: gameID, newGameID, loser: resignSide, winner };
    }
}