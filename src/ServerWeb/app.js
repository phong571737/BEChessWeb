import { SocketController } from "/app/src/ServerWeb/js/socket/socket.controller.js";
import { GameSyncManager } from "/app/src/ServerWeb/js/core/game.syncmanager.js";
import { RouterPath } from "/app/src/ServerWeb/js/routers/router.path.js";

document.addEventListener('DOMContentLoaded', async() =>{
    SocketController.init();
    GameSyncManager.init();

    RouterPath.init();
});