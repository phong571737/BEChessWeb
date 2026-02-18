import { ViewManager } from "/ServerWeb/js/core/viewManager.js";
import { BoardUI } from "/ServerWeb/js/board/board.ui.js";
import { GameView } from "/ServerWeb/js/components/gameView.js";
import { GameSyncManager } from "/ServerWeb/js/game/game.syncmanager.js";
import { GameController } from "/ServerWeb/js/game/game.controller.js";

export const BoardPage = {
    render(gameID) {
        const main_container = document.getElementById("main-wrapper");
        const viewID = `view-game-${gameID}`
        if (!main_container) return;

        ViewManager.hideAll();

        const existingview = ViewManager.get(viewID);
        //if exists, display
        if (existingview) {
            existingview.style.display = "grid";

            const boardInstance = GameSyncManager.getBoard(gameID);
            if (boardInstance && boardInstance.board) {
                requestAnimationFrame(() => {
                    boardInstance.board.resize();
                    if (GameController.lastMove) {
                        boardInstance.HighlightMove(
                            GameController.lastMove.from,
                            GameController.lastMove.to
                        );
                    }
                    boardInstance.HighlightKing();
                });
            }
            return;
        }

        const game_board = GameView.MainContainer(gameID);
        game_board.id = viewID;

        main_container.appendChild(game_board);

        ViewManager.register(viewID, game_board);

        /**create board instance */
        const boardUI = new BoardUI(`Board_${gameID}`, gameID);
        boardUI.init();
        GameSyncManager.addBoard(boardUI);
    }
}