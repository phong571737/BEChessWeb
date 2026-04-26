import { GameSyncManager } from "../core/game.syncmanager.js";

export const BoardView = {
    render(gameID, fen) {
        if (typeof fen !== "string") return;

        const boards = GameSyncManager.getBoards(gameID);
        if (!boards?.length) return; 

        // update board position
        for (const boardUI of boards) {
            boardUI.update();
        }
    }
}