import { ViewManager } from "../core/view.manager.js";
import { BoardViewController } from "/ServerWeb/js/controller/board.view.controller.js";
import { BoardInitController } from "/ServerWeb/js/controller/board.init.controller.js";
import { GameLoader } from "/ServerWeb/js/core/game.loader.js";
import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";
import { PGNEditController } from "/ServerWeb/js/controller/pgn.edit.controller.js";
import { GameActionController } from "/ServerWeb/js/controller/game.action.controller.js";
import { InitCheck } from "/ServerWeb/js/core/board.init.check.js";

export const BoardPage = {
    async render(gameID) {
        //fetch game from db
        await GameLoader.load(gameID);

        const gc = GameSyncManager.getController(gameID);
        if (!gc) return;

        const container = document.getElementById("main-wrapper");
        if (!container) return;

        ViewManager.hideAll();

        // Mout view
        const { isNew } = BoardViewController.getOrCreate(gameID, container);
        if (isNew) {
            BoardInitController.create(gameID, container)//if not exists, create a new board 
        } else {
            BoardInitController.resume(gameID); // else, display
        }

        // send fen to server to get engine
        GameSyncManager.requestEval(gameID, gc);
        this.updateName(gc);

        if (!gc._uiBound) {
            const viewID = document.getElementById(`view-game-${gameID}`);

            new PGNEditController(gc, viewID).init();
            const actionController = new GameActionController(gc);
            actionController.init();

            gc._uiBound = true;
        }
    },

    updateName(gc) {
        // reload name
        const whiteEl = document.getElementById("white-name");
        const blackEl = document.getElementById("black-name");

        if (whiteEl) whiteEl.textContent = gc.WhiteName;
        if (blackEl) blackEl.textContent = gc.BlackName;
    }
}