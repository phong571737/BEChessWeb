import { SocketController } from "./js/socket/socket.controller.js";
import { GameSyncManager } from "./js/core/game.syncmanager.js";
import { RouterPath } from "./js/routers/router.path.js";

document.addEventListener('DOMContentLoaded', async() =>{
    SocketController.init();
    GameSyncManager.init();

    RouterPath.init();
});