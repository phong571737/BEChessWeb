/**This file is used to lifecycle manager:
 * Board UI lifecycle: create, store, sync
 */
import { BoardUI } from "/ServerWeb/js/views/board.ui.js";
import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";
import { InitCheck } from "/ServerWeb/js/core/board.init.check.js";
import { SocketController } from "/ServerWeb/js/socket/socket.controller.js";
import { updateNotify } from "../core/notify.manager.js";

export const BoardInitController = {
    // This function is used to create a new board for a game
    create(gameID, container) {
        // get controller
        const controller = GameSyncManager.getController(gameID);

        /**create board instance */
        const boardUI = new BoardUI(`Board_${gameID}`, controller);
        controller.boardUI = boardUI;
        boardUI.isPrimary = true;
        boardUI.init();
        GameSyncManager.addBoard(gameID, boardUI);

        // join room and start to wait initcheck
        SocketController.joinRoom(gameID);
        updateNotify(gameID);

        // callback when game init success
        InitCheck.onInitReady = () => {
            console.log(`Game ${gameID} ready!`);
        }

        requestAnimationFrame(() => {
            this._setup(boardUI, controller);
        });

        return boardUI;
    },

    // Restore an existing board after navigation or reload
    resume(gameID) {
        const controller = GameSyncManager.getController(gameID);
        const boardUI = GameSyncManager.getBoards(gameID)
            ?.find(b => b.elementID === `Board_${gameID}`);
        if (!boardUI?.board) return;

        requestAnimationFrame(() => {
            this._setup(boardUI, controller);
            boardUI.syncPlayerWidth();
        });
    },

    // This function is used to update UI
    _setup(boardUI, controller) {
        boardUI.board.resize(); 
        boardUI.ui.update();

        if (controller.lastMove) {
            boardUI.HighlightMove(controller.lastMove.from, controller.lastMove.to);
        }
        boardUI.HighlightKing();
    },
}