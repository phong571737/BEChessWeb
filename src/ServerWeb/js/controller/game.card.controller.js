/**This file is used to controller
 * create a board to dashboard */
import { BoardUI } from "/ServerWeb/js/views/board.ui.js";
import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";
import { GameModel } from "/ServerWeb/js/model/game.model.js";
import { RouterPath } from "/ServerWeb/js/routers/router.path.js";
import { GameCardView } from "/ServerWeb/js/views/game.card.view.js";
import { SocketController } from "/ServerWeb/js/socket/socket.controller.js";
import { IDUtils } from "../utils/id.utils.js";

export const GameCardController = {
    /**create game */
    add(GameID, fen=null, lastMove = null, pgn=null, WhiteName = "White", BlackName = "Black"){
        if(document.getElementById(`MiniBoard_${GameID}`)) return;

        // View
        GameCardView.hideEmptyState();
        const card_board = GameCardView.createCard(GameID, WhiteName, BlackName);
        document.querySelector('.game-playing').appendChild(card_board);

        /**create board instance */
        const model = this._getOrCreateModel(GameID,{ fen, pgn, lastMove, WhiteName, BlackName});

        // BoardUI + moveController
        const boardUI = new BoardUI(`MiniBoard_${GameID}`, model);
        boardUI.isPrimary = false;
        boardUI.init();

        GameSyncManager.addBoard(GameID, boardUI);

        // Join room
        SocketController.socket?.emit("join", {gameID: GameID});

        requestAnimationFrame(async ()=>{
            if(lastMove){
                await boardUI.moveController.onMove(lastMove.from, lastMove.to);
            }
        })

        card_board.addEventListener('click', (e)=>{
            if (e.target.closest(".round-remove")) return; // avoid clicking on areas other than the board
            this.openGame(GameID);
        })
    },

    // open game
    openGame(gameID){
        RouterPath.navigationTo(`/board?id=${IDUtils.encode(gameID)}`);
    },

    _getOrCreateModel(GameID, { fen, pgn, lastMove, WhiteName, BlackName }){
        let model = GameSyncManager.getController(GameID);
        if(!model){
            model = new GameModel({ gameID: GameID, fen, pgn, lastMove, WhiteName, BlackName });
            if(!pgn){
                model.setInitialHeader();
            }
            GameSyncManager.setController(GameID, model);
        }
        return model;
    }
}