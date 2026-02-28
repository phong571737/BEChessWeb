import { ViewManager } from "/ServerWeb/js/core/viewManager.js";
import { BoardUI } from "/ServerWeb/js/board/board.ui.js";
import { GameView } from "/ServerWeb/js/components/gameView.js";
import { GameSyncManager } from "/ServerWeb/js/game/game.syncmanager.js";
import { GameController } from "/ServerWeb/js/game/game.controller.js";

export const BoardPage = {
    async render(gameID) {
        //fetch game from db
        await this.reloadBoard(gameID);

        const main_container = document.getElementById("main-wrapper");
        const viewID = `view-game-${gameID}`;
        if (!main_container) return;

        ViewManager.hideAll();

        const existingview = ViewManager.get(viewID);
        existingview ? this.showExistingView(gameID, existingview)//if exists, display
            : this.createNew(gameID, main_container); // else, create new
    },

    async reloadBoard(gameID) {
        if (GameSyncManager.getController(gameID)) return;
        try {
            const game = await fetch(`/games/${gameID}`).then(r => r.json())
            console.log("Game from server: ", game);
            GameSyncManager.setController(gameID, new GameController(game));
        } catch (e) {
            console.error("Failed to restore game ", e);
        }
    },

    showExistingView(gameID, view) {
        console.log("REUSE existing view");
        view.style.display = "grid";
        const controller = GameSyncManager.getController(gameID);

        requestAnimationFrame(() => {
            const gameBoard = GameSyncManager.getBoards(gameID)
                ?.find(b => b.elementID === `Board_${gameID}`);
            if (!gameBoard?.board) return;

            gameBoard.board.resize();
            gameBoard.update();
            gameBoard.ui.update();

            if (controller.lastMove) {
                gameBoard.HighlightMove( controller.lastMove.from, controller.lastMove.to);
            }
            gameBoard.HighlightKing();
        });
    },

    createNew(gameID, container) {
        const controller = GameSyncManager.getController(gameID);// get controller
        const viewID = `view-game-${gameID}`;
        const game_board = GameView.MainContainer(gameID);
        // game_board.id = viewID;
        container.appendChild(game_board);
        ViewManager.setView(viewID, game_board);

        /**create board instance */
        const boardUI = new BoardUI(`Board_${gameID}`, controller);
        boardUI.init();
        GameSyncManager.addBoard(gameID, boardUI);
        
        requestAnimationFrame(()=>{
            boardUI.board.resize();
            boardUI.ui.update();

            if (controller.lastMove) {
                boardUI.HighlightMove( controller.lastMove.from, controller.lastMove.to);
            }
            boardUI.HighlightKing();
        });
    }
}