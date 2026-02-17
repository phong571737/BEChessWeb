import { BoardUI } from "/ServerWeb/js/Board/board.ui.js";
import { GameSyncManager } from "/ServerWeb/js/Game/game.syncmanager.js";
import { GameController } from "/ServerWeb/js/Game/game.controller.js";
import { RouterPath } from "/ServerWeb/js/routers/index.js";

export const GameCard = {
    BoardWrapper(GameID){
        /*div class='board-wrapper'*/
        const wrapper = document.createElement('div');
        wrapper.className = 'board-wrapper'; 

        /**div class='game-card' id='game-card' */
        const boardchess = document.createElement('div');
        boardchess.className = 'game-card';
        boardchess.id = `MiniBoard_${GameID}`;  

        wrapper.appendChild(boardchess);
        return wrapper;
    },

    createGameCard(GameID){
        const card = document.createElement('div');
        card.className = 'game-card';

        const boardwrapper = this.BoardWrapper(GameID);
        card.appendChild(boardwrapper);

        return card;
    },

    /**create game */
    addGame(GameID){
        if(document.getElementById(`Board_${GameID}`)){
            console.log("Game is exist: ", GameID);
            return;
        }

        //hide empty state
        const empty = document.getElementById('emptyState');
        if(empty) empty.style.display = 'none';

        const card = this.createGameCard(GameID);
        document.querySelector('.game-playing').appendChild(card);

        /**create board instance */
        const boardUI = new BoardUI(`MiniBoard_${GameID}`, GameID);
        boardUI.init();
        GameSyncManager.addBoard(boardUI);
        console.log("History before open:", GameController.game.history());

        card.addEventListener('click', ()=>{
            this.openGame(GameID);
        })
    },

    /**open game */
    openGame(gameID){
        RouterPath.navigationTo(`/board/${gameID}`);
    },
}