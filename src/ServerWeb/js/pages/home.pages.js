import { GameSyncManager } from "/ServerWeb/js/game/game.syncmanager.js";
import { ViewManager } from "/ServerWeb/js/core/viewManager.js";

export const HomePage = {
    render(){
        ViewManager.hideAll();
        ViewManager.show("dashboard-view");

        /**Resize board when to home */
        requestAnimationFrame(()=>{
            GameSyncManager.getAllBoards().forEach((boardArray, _) =>{
                boardArray.forEach(boardUI =>{
                    if(boardUI.board){
                        boardUI.board.resize();
                    }
                });
            });
        });
    },
}