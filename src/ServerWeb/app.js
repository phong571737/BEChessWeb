import { SocketController } from "/ServerWeb/js/socket/socket.controller.js";
import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";
import { RouterPath } from "/ServerWeb/js/routers/router.path.js";
import { NavbarController } from "/ServerWeb/js/controller/navbar.controller.js";

document.addEventListener('DOMContentLoaded', async() =>{
    SocketController.init();
    GameSyncManager.init();
    RouterPath.init(); // init router
    NavbarController.init(); //init responsive for mobile
});