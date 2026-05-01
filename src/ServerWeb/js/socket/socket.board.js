import { GameCardController } from "../controller/game.card.controller.js";
import { GameView } from "../views/game.view.js";
import { InitCheck } from "../core/board.init.check.js";
import { GameSyncManager } from "../core/game.syncmanager.js";
import { GameState } from "../core/game.state.js";
import { updateNotify } from "../core/notify.manager.js";

export function BoardEvent(socket) {
    //Create New Game
    // socket.on("board_connected", ({ gameID }) => {
    //     if (!gameID) return;

    //     GameCardController.add(gameID);
    //     GameState.set(gameID, {
    //         boardStatus: "online",
    //         gameStatus: "waiting",
    //     });
    //     updateNotify(gameID);

    //     const controller = GameSyncManager.getController(gameID);
    //     if (!controller) return;

    //     InitCheck.startWaitingForBoard(controller, gameID);
    // });

    // socket.on("board_disconnected", ({gameID}) => {
    //     GameState.set(gameID, {boardStatus: "offline"});
    //     updateNotify(gameID);
    //     InitCheck.stopPolling(gameID);
    //     // GameView.setNotify("Board disconnected", "disconnect", gameID);
    // })

    socket.on("game_state", (state) => {
        const { gameID } = state;
        if (!gameID) return;

        GameState.set(gameID, state);

        updateNotify(gameID);

        const controller = GameSyncManager.getController(gameID);
        if (!controller) return;

        const boardUI = controller.boardUI;
        if (!boardUI) return;

        boardUI.ClearHighlightInitErrors();

        if (state.boardStatus === "online" && state.gameStatus === "checkinit") {
            boardUI.HighlightInitErrors(
                state.wrongSquares || [],
                state.missingSquares || []
            );
        }

        // if (state.boardStatus === "online" && state.gameStatus === "checkinit") {
        //     InitCheck.startWaitingForBoard(controller, gameID);
        // } else if (state.boardStatus === "offline") {
        //     InitCheck.stopPolling(gameID);
        // }
    });

    // notify rename for all web client
    socket.on("game:renamed", ({ color, name }) => {
        const id = color === "Black" ? "black-name" : "white-name";
        document.getElementById(id).textContent = name;
    });
}