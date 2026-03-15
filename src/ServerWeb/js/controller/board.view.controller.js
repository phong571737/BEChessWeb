/**This file is used to create 
 * or reuse view */
import { GameView } from "/ServerWeb/js/components/gameView.js";
import { ViewManager } from "/ServerWeb/js/core/viewManager.js";

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