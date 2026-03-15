/**This file is used to controller
 * create a board to dashboard */
import { BoardUI } from "/ServerWeb/js/views/board.ui.js";
import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";
import { GameModel } from "/ServerWeb/js/model/game.model.js";
import { RouterPath } from "/ServerWeb/js/routers/router.path.js";
import { GameCardView } from "/ServerWeb/js/views/game.card.view.js";

export const GameCardController = {
    /**create game */
    add(GameID, fen=null, lastMove = null, pgn=null){
        if(document.getElementById(`MiniBoard_${GameID}`)) return;

        // View
        GameCardView.hideEmptyState();
        const card = GameCardView.createCard(GameID);
        document.querySelector('.game-playing').appendChild(card);

        /**create board instance */
        const model = this._getOrCreateModel(GameID,{ fen, pgn, lastMove});

        // BoardUI + moveController
        const boardUI = new BoardUI(`MiniBoard_${GameID}`, model);
        boardUI.init();

        GameSyncManager.addBoard(GameID, boardUI);

        requestAnimationFrame(async ()=>{
            if(lastMove){
                await boardUI.moveController.onMove(lastMove.from, lastMove.to);
            }
        })

        card.addEventListener('click', ()=>{
            this.openGame(GameID);
        })
    },

    // open game
    openGame(gameID){
        RouterPath.navigationTo(`/board/${gameID}`);
    },

    _getOrCreateModel(GameID, { fen, pgn, lastMove }){
        let model = GameSyncManager.getController(GameID);
        if(!model){
            model = new GameModel({ gameID: GameID, fen, pgn, lastMove });
            if(!pgn){
                model.setInitialHeader();
            }
            GameSyncManager.setController(GameID, model);
        }
        return model;
    }
}