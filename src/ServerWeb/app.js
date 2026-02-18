import { SocketController } from "/ServerWeb/js/socket/socket.controller.js";
import { GameSyncManager } from "/ServerWeb/js/game/game.syncmanager.js";
import { RouterPath } from "/ServerWeb/js/routers/router.path.js";

document.addEventListener('DOMContentLoaded', async() =>{
    SocketController.init();
    GameSyncManager.init();

    RouterPath.init();
});