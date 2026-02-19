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
            const controller = GameSyncManager.getController(gameID);

            requestAnimationFrame(() => {
                const gameBoard = GameSyncManager.getBoards(gameID);
                if (!gameBoard) return;

                gameBoard.forEach(boardUI => {
                    if (boardUI.board) {
                        boardUI.board.resize();
                        boardUI.update();

                        if (controller.lastMove) {
                            boardUI.HighlightMove(
                                controller.lastMove.from,
                                controller.lastMove.to
                            );
                        }

                        boardUI.HighlightKing();
                    }
                });
            });
            return;
        }

        const game_board = GameView.MainContainer(gameID);
        game_board.id = viewID;

        main_container.appendChild(game_board);

        ViewManager.register(viewID, game_board);

        /**create board instance */
        const controller = GameSyncManager.getController(gameID) // get controller
        const boardUI = new BoardUI(`Board_${gameID}`, controller);
        boardUI.init();
        GameSyncManager.addBoard(gameID, boardUI);
    }
}