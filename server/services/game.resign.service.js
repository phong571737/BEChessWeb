import { Chess } from "chess.js";
import { endGameOnce, loadGame, saveGame } from "../models/game.model.js";
import { resetGame, games as memGames } from "../game/game.manager.js";
import { getIO } from "../sockets/index.js";
import { getBoardRegistry } from "../routes/board.route.js";

export const GameResignService = {
    async handle(gameID, resignSide) {
        // Validate 
        if (!resignSide || !["white", "black", "draw"].includes(resignSide)) {
            throw new Error("resignSide error");
        }

        const game = await loadGame(gameID);
        if (!game) throw new Error("Game not found");
        
        const winner = resignSide === "draw" ? null : resignSide === "white" ? "black" : "white";
        const chess = new Chess();

        // Prefer in-memory PGN (real-time, from incremental builder) over DB PGN
        const memGame = memGames.get(gameID);
        const livePgn = memGame ? memGame.pgn() : null;
        const pgn = (livePgn && livePgn.trim()) ? livePgn
          : (typeof game.pgn === "string" && game.pgn.trim()) ? game.pgn
          : "";
        if (pgn) chess.loadPgn(pgn);
        const resultTag = resignSide === "draw" ? "1/2-1/2" : resignSide === "white" ? "0-1" : "1-0";
        const now = new Date();
        const dateTag = now.toISOString().slice(0, 10).replace(/-/g, ".");
        chess.setHeader("Event", "TTLab Chess");
        chess.setHeader("Site", process.env.PUBLIC_SITE || "TTLab Arena");
        chess.setHeader("Round", String(game.gameID || gameID));
        chess.setHeader("White", game.WhiteName || "White");
        chess.setHeader("Black", game.BlackName || "Black");
        chess.setHeader("Result", resultTag);
        chess.setHeader("Date", dateTag);
        if (game.fen && game.fen !== new Chess().fen()) {
          chess.setHeader("SetUp", "1");
          chess.setHeader("FEN", game.fen);
        }
        const finalPGN = chess.pgn();
        const endedAt = new Date();
        const startedAt = game.createdAt ? new Date(game.createdAt) : null;
        const durationSec = startedAt ? Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)) : null;

        const result = resignSide === "draw" ? "1/2-1/2" : resignSide === "white" ? "0-1" : "1-0";

        // Save to game played
        const finalFen = chess.fen();
        const doc = {
            gameID,
            pgn: finalPGN,
            Result: result,
            WhiteName: game.WhiteName || "White",
            BlackName: game.BlackName || "Black",
            White: game.WhiteName || "White",
            Black: game.BlackName || "Black",
            Date: new Date().toISOString().split("T")[0],
            totalPlies: game.lastSeq ?? 0,
            totalMoves: game.lastSeq ?? 0,
            fenStart: "start",
            fenEnd: finalFen,
            fenHistory: Array.isArray(game.fenHistory) ? game.fenHistory : [],
            source: "pgn",
            endReason: resignSide === "draw" ? "draw_agreed" : "resigned",
            loser: resignSide === "draw" ? null : resignSide,
            winner,
            createAt: startedAt ?? endedAt,
            endedAt,
            durationSec,
        }

        await endGameOnce(doc);
        resetGame(gameID);
        await saveGame(gameID, {
            fen: new Chess().fen(),
            pgn: "",
            lastMove: null,
            lastSeq: 0,
            status: "finished",
            result,
        });

        // Detach board from this finished game so ESP32 shows as "Ready" again
        const registry = getBoardRegistry();
        for (const [boardID, info] of registry) {
            if (info.gameID === gameID) {
                info.gameID = null;
                // Notify clients that this board is now free
                getIO().emit("board_heartbeat", { boardID, gameID: null, online: true, lastSeen: info.lastSeen });
                break;
            }
        }

        // Notify all connected clients (game room + home page)
        const io = getIO();
        const payload = { gameID, status: "finished", result, winner };
        io.to(gameID).emit("game_status_update", payload);
        io.emit("game_status_update", payload);
        io.emit("game:destroyed", { gameID }); // home page refreshes active game list

        return { message: resignSide === "draw" ? "Draw success" : "Resign success", loser: resignSide === "draw" ? null : resignSide, winner, result };
    }
}
