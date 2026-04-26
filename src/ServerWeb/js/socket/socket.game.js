import { GameSyncManager } from "../core/game.syncmanager.js";

export function GameEvent(socket) {
    // Listen to restore data from server
    socket.on("restore_game", (data) => {
        document.dispatchEvent(
            new CustomEvent("socket:restore", { detail: data })
        );
    });

    // Listen move event
    socket.on("esp_move", (data) => {
        document.dispatchEvent(
            new CustomEvent("socket:move", { detail: data })
        );
    });

    socket.on("update_all_game", ({gameID}) => {
        if (!gameID) return;

        localStorage.removeItem(`game_state_${gameID}`);

        // Reset board
        const controller = GameSyncManager.getController(gameID);
        if (controller) {
            controller.game.reset();
            controller.lastMove = null;
        }

        const boards = GameSyncManager.getBoards(gameID);
        boards?.forEach(boardUI => {
            boardUI.clearAllHighlight();
            boardUI.ui.update();
        });
    })
}