import { getCurrentState } from "../game/game.manager.js";

export function initGameSocket(io) {
    io.on("connection", (socket) => {

        socket.on("join", ({ gameID }) => {
            socket.join(gameID);
            console.log(`${socket.id} joined room: ${gameID}`);
        });

        socket.on("request_current_game", async (data) => {
            if (!data?.gameID) return;
            const gameID = data.gameID;
            try {
                const state = await getCurrentState(gameID);
                if (state) {
                    socket.emit("restore_game", {
                        gameID: state.gameID,
                        fen: state.fen,
                        lastMove: state.lastMove,
                    });
                }
            } catch (err) {
                console.error("[GameSocket] request_current_game error:", err);
            }
        });

        socket.on("restart", ({ gameID }) => {
            if (!gameID) return;
            io.to(gameID).emit("update_all_game", { gameID });
        });
    });
}