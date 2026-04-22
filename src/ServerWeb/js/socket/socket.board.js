import { GameCardController } from "../controller/game.card.controller.js";
import { GameView } from "../views/game.view.js";
import { InitCheck } from "../core/board.init.check.js";
import { GameSyncManager } from "../core/game.syncmanager.js";

export function BoardEvent(socket) {
    //Create New Game
    socket.on("board_connected", ({ gameID }) => {
        if (!gameID) return;

        GameCardController.add(gameID);

        const controller = GameSyncManager.getController(gameID);
        if (controller) {
            GameView.setNotify("Board connected", "waiting", gameID); //notify state 
            InitCheck.startWaitingForBoard(controller, gameID);
        }
    });

    // notify rename for all web client
    socket.on("game:renamed", ({ color, name }) => {
        const id = color === "Black" ? "black-name" : "white-name";
        document.getElementById(id).textContent = name;
    });
}