import { GamePlayedController } from "/ServerWeb/js/controller/game.played.controller.js";
import { PGNModalController } from "/ServerWeb/js/controller/pgn.modal.controller.js";
import { ViewManager } from "../core/view.manager.js"
import { GamePlayedView } from "/ServerWeb/js/views/game.played.view.js";

export const GamePage = {
    async render(){
        const viewID = "view-game-history";
        ViewManager.hideAll();
        
        const main_wrapper = document.getElementById("main-wrapper");

        let view = ViewManager.get(viewID);
        if(!view){
            view = GamePlayedView.MainPlayed();
            view.id = viewID;
            main_wrapper.append(view);
            ViewManager.setView(viewID, view);
        }
        ViewManager.show(viewID);

        GamePlayedController.init(view);
        PGNModalController.bind(view);
    }
} 