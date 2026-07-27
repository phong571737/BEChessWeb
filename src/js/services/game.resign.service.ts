import { Chess } from "chess.js";
import { endGame, getGame, saveGame } from "../models/game.model.js";
import { resetGame } from "../game/game.manager.js";
import { games, gameSeq, activeBranches, rawMoveHistory, pgnBaseFen } from "../game/game.repository.js";
import { ERROR_STATUS, GAME_STATUS } from "../constant.js";
import { GameService } from "./game.service.js";
import { GameDoc, ResignSide } from "../types/game.types.js";
import { customPGN } from "../utils/custom.chess.js";
import { inferMoveFromFen } from "../utils/chess.utils.js";
import { MoveLike } from "../types/chess.types.js";

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

function buildFinalPGN(game: GameDoc, uciHistory: string[], fenHistory: string[], resultTag: string): string {
    const startFen = typeof game.initialFen === "string" ? game.initialFen : undefined;
    const moves: MoveLike[] = [];
    let previousFen = startFen || new Chess().fen();
    const total = Math.max(uciHistory.length, fenHistory.length);

    for (let index = 0; index < total; index++) {
        const uci = uciHistory[index]?.trim();
        const validUci = uci?.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
        const inferred = !validUci && fenHistory[index]
            ? inferMoveFromFen(previousFen, fenHistory[index]!)
            : null;
        if (validUci) {
            moves.push({ from: validUci[1] as MoveLike["from"], to: validUci[2] as MoveLike["to"], promotion: validUci[3]?.toLowerCase() as MoveLike["promotion"] });
        } else if (inferred) {
            moves.push({ from: inferred.from as MoveLike["from"], to: inferred.to as MoveLike["to"], promotion: inferred.promotion as MoveLike["promotion"] });
        } else {
            // The custom PGN renderer turns an unknown move into an explicit `x` token.
            moves.push({ from: "--" as MoveLike["from"], to: "--" as MoveLike["to"] });
        }
        if (fenHistory[index]) previousFen = fenHistory[index]!;
    }

    return customPGN(moves, startFen, {
        White: game.WhiteName || "White",
        Black: game.BlackName || "Black",
        Result: resultTag,
        Date: new Date().toISOString().slice(0, 10).replace(/-/g, "."),
    }).pgn;
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
        let fenHistory: string[] = Array.isArray(game.fenHistory) ? game.fenHistory.filter((fen): fen is string => typeof fen === "string") : [];
        let uciHistory: string[] = Array.isArray(game.uciHistory) ? game.uciHistory.filter((uci): uci is string => typeof uci === "string") : [];

        if (branchId) {
            const branch = game.branches?.find((b) => b.id === branchId);
            if (!branch) {
                throw new Error("Branch not found");
            }
            // pgn = branch.pgn ?? "";
            fenHistory = Array.isArray((branch as any).fenHistory) ? (branch as any).fenHistory : fenHistory;
            uciHistory = Array.isArray((branch as any).uciHistory) ? (branch as any).uciHistory : uciHistory;
        }

        const resultTag = buildResultTag(resignSide);
        const finalPGN = buildFinalPGN(game, uciHistory, fenHistory, resultTag);
        const currentRound = game.round ?? 1;
        const nextRound = currentRound + 1;

        // Save to game played
        const endedAt = new Date();
        const startedAt = game.startedAt ?? game.createdAt ?? endedAt;
        const durationSec = game.startedAt
            ? Math.max(0, Math.floor((endedAt.getTime() - new Date(game.startedAt).getTime()) / 1_000))
            : game.durationSec ?? null;
        const doc = {
            gameID,
            pgn: finalPGN,
            initialFen: game.initialFen,
            totalMoves: fenHistory.length,
            round: currentRound,
            uciHistory,
            fenHistory,
            createdAt: startedAt,
            startedAt,
            endedAt,
            durationSec,
        }

        await endGame(doc);

        resetGame(gameID);
        // Remove old games from RAM
        games.delete(gameID);
        gameSeq.delete(gameID);
        activeBranches.delete(gameID);
        rawMoveHistory.delete(gameID);
        pgnBaseFen.delete(gameID);

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
