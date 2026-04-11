import { ViewManager } from "../core/viewManager.js";
import { BoardViewController } from "../controller/board.view.controller.js";
import { BoardInitController } from "../controller/board.init.controller.js";
import { GameLoader } from "../core/game.loader.js";
import { GameSyncManager } from "../core/game.syncmanager.js";
import { PGNEditController } from "../controller/pgn.edit.controller.js";
import { GameActionController } from "../controller/game.action.controller.js";
import { InitCheck } from "../core/board.init.check.js";

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
        if (gc.game.history().length === 0) {
            InitCheck.startPollingInitCheck(gc, gameID);
        }
        const viewID = document.getElementById(`view-game-${gameID}`);
        new PGNEditController(gc, viewID).init();
        const actionController = new GameActionController(gc);
        actionController.init();
        return actionController;
    },
}