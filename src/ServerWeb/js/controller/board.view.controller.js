/**This file is used to create 
 * or reuse view */
import { GameView } from "/ServerWeb/js/views/game.view.js";
import { ViewManager } from "../../js/core/view.manager.js";

export const BoardViewController = {
    getOrCreate(gameID, container) {
        const viewID = `view-game-${gameID}`;
        const existing = ViewManager.get(viewID);

        // View existing
        if(existing) {
            existing.style.display = "grid";
            return {
                view: existing,
                isNew: false
            }
        }

        const view = GameView.MainContainer(gameID);
        container.appendChild(view);
        ViewManager.setView(viewID, view);
        return {
            view,
            isNew: true
        }
    }
}