import { GamePlayedController } from "../controller/game.played.controller.js";
import { PGNModalController } from "../controller/pgn.modal.controller.js";
import { ViewManager } from "../core/viewManager.js"
import { GamePlayedView } from "../views/game.played.view.js";

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