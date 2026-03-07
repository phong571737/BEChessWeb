import { BoardUI } from "/ServerWeb/js/board/board.ui.js";
import { GameSyncManager } from "/ServerWeb/js/game/game.syncmanager.js";
import { GameController } from "/ServerWeb/js/game/game.controller.js";
import { RouterPath } from "/ServerWeb/js/routers/router.path.js";

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
        card.appendChild(
            boardwrapper
        );

        return card;
    },

    /**create game */
    addGame(GameID, fen=null, lastMove = null, pgn=null){
        if(document.getElementById(`MiniBoard_${GameID}`)){
            console.log("Game is exist: ", GameID);
            return;
        }

        //hide empty state
        const empty = document.getElementById('emptyState');
        if(empty) empty.style.display = 'none';

        const card = this.createGameCard(GameID);
        document.querySelector('.game-playing').appendChild(card);

        /**create board instance */
        let controller = GameSyncManager.getController(GameID);
        if(!controller){
            controller = new GameController({
                gameID: GameID,
                fen,
                pgn,
                lastMove
            });
            GameSyncManager.setController(GameID, controller);
        }

        const boardUI = new BoardUI(`MiniBoard_${GameID}`, controller);
        boardUI.init();
        GameSyncManager.addBoard(GameID, boardUI);

        requestAnimationFrame(()=>{
            if(lastMove){
                boardUI.renderUpdate(lastMove.from, lastMove.to);
            }
        })

        card.addEventListener('click', ()=>{
            this.openGame(GameID);
        })
    },

    /**open game */
    openGame(gameID){
        // const cleanID = gameID.replace(/^Board_/i, "");
        RouterPath.navigationTo(`/board/${gameID}`);
    },
}