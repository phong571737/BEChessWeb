import { ViewManager } from "/ServerWeb/js/core/viewManager.js";
import { BoardViewController } from "/ServerWeb/js/controller/board.view.controller.js";
import { BoardInitController } from "/ServerWeb/js/controller/board.init.controller.js";
import { GameLoader } from "/ServerWeb/js/core/game.loader.js";
import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";
import { PGNEditController } from "/ServerWeb/js/controller/pgn.edit.controller.js";
import { GameActionController } from "/ServerWeb/js/controller/game.action.controller.js";

export const BoardPage = {
    async render(gameID) {
        //fetch game from db
        await GameLoader.load(gameID);

        const container = document.getElementById("main-wrapper");
        if (!container) return;

        ViewManager.hideAll();

        const { isNew } = BoardViewController.getOrCreate(gameID, container); 
        isNew ? BoardInitController.create(gameID, container)//if not exists, create a new board 
            : BoardInitController.resume(gameID); // else, display

        const gc = GameSyncManager.getController(gameID);
        const viewID = document.getElementById(`view-game-${gameID}`);
        new PGNEditController(gc, viewID).init();
        const actionController = new GameActionController(gc);
        actionController.init();
        return actionController;
    },

}