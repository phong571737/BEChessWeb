import { GamePlayed } from "/ServerWeb/js/components/gameplayed.js";
import { ViewManager } from "/ServerWeb/js/core/viewManager.js"

export const GamePage = {
    async render(){
        const viewID = "view-game-history";
        ViewManager.hideAll();
        
        const main_wrapper = document.getElementById("main-wrapper");

        let view = ViewManager.get(viewID);
        if(!view){
            view = GamePlayed.MainPlayed();
            view.id = viewID;
            main_wrapper.append(view);
            ViewManager.setView(viewID, view);
        }
    }
} 