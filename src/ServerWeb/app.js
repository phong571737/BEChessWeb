import { SocketController } from "/ServerWeb/js/Socket/socket.controller.js";
import { GameSyncManager } from "/ServerWeb/js/Game/game.syncmanager.js";
import { RouterPath } from "/ServerWeb/js/routers/index.js";

document.addEventListener('DOMContentLoaded', async() =>{
    SocketController.init();
    GameSyncManager.init();

    RouterPath.init();
});