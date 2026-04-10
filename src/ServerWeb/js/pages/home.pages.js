import { GameCardController } from "/app/src/ServerWeb/js/controller/game.card.controller.js";
import { GameSyncManager } from "/app/src/ServerWeb/js/core/game.syncmanager.js";
import { ViewManager } from "/app/src/ServerWeb/js/core/viewManager.js";

export const HomePage = {
    async render(){
        ViewManager.hideAll();
        ViewManager.show("dashboard-view");

        //fetch game from db
        try{
            const games = await fetch("/games/current")
                                .then(r => r.json())
            if(games && games.length > 0){
                games.forEach(game =>{
                    GameCardController.add(game._id, game.fen, game.lastMove, game.pgn);
                });
            }
        }catch(e){
            console.error("Failed to restore game ", e);
        }

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