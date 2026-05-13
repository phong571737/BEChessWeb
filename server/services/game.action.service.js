import { Chess } from "chess.js";
import { resetGame, destroyBoard } from "../game/game.manager.js";
import { loadGame, renamePlayer, removeGame, saveGame } from "../models/game.model.js";
import { getIO } from "../sockets/index.js";
import { setGamePendingCommand } from "../routes/board.route.js";

export const GameActionService = {
    async restart(gameID) {
        resetGame(gameID);
        await saveGame(gameID, {
            gameID,
            fen: new Chess().fen(),
            pgn: "",
            fenHistory: [],
            lastMove: null,
            lastSeq: 0,
            status: "waiting_scan",
            result: null,
            scanMissing: [],
            scanReason: null,
        });

        // Queue START command so ESP32 will scan pieces on next heartbeat
        setGamePendingCommand(gameID, "START");

        const io = getIO();
        // Reset board state (FEN/PGN back to start) on clients watching this game
        io.to(gameID).emit("update_all_game", { gameID });
        // Transition client UI to scan overlay — emit to room AND globally (home page)
        io.to(gameID).emit("game_status_update", { gameID, status: "waiting_scan" });
        io.emit("game_status_update", { gameID, status: "waiting_scan" });
    },

    async reset(gameID) {
        resetGame(gameID);
        await saveGame(gameID, {
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            pgn: "",
            lastMove: null,
            lastSeq: 0,
        });
    },

    async rename(gameID, color, name) {
        if (!name.trim() || !["Black", "White"].includes(color)) return;

        const game = await loadGame(gameID);
        if (!game) return;

        await renamePlayer(gameID, color, name);

        // Emit separate fields so use-game.ts can patch only the changed side
        const payload = { gameID };
        if (color === "White") payload.WhiteName = name;
        else payload.BlackName = name;
        getIO().to(gameID).emit("game:renamed", payload);
    },

    async destroy(gameID) {
        destroyBoard(gameID);
        return await removeGame(gameID);
    },
}
