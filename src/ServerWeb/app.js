import { SocketController } from "/ServerWeb/js/socket/socket.controller.js";
import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";
import { RouterPath } from "/ServerWeb/js/routers/router.path.js";
import { NavbarController } from "/ServerWeb/js/controller/navbar.controller.js";
import { eventBus } from "./js/utils/eventbus.instance.js";
import { GameStore } from "./js/utils/game.store.js";
import { BoardView } from "./js/views/board.view.js";
import { EvalView } from "./js/views/eval.view.js";

document.addEventListener('DOMContentLoaded', async() =>{
    SocketController.init();
    GameSyncManager.init();
    RouterPath.init(); // init router
    NavbarController.init(); //init responsive for mobile

    eventBus.on("eval:update", (gameID) => {
        const state = GameStore.get(gameID);
        if (!state) return;

        EvalView.render(gameID, state.cp);
    });

    eventBus.on("game:update", (gameID) => {
        const state = GameStore.get(gameID);
        if (!state) return;

        BoardView.render(gameID, state.fen);
    });
});