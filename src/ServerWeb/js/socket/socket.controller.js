import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";
import { GameCardController } from "/ServerWeb/js/controller/game.card.controller.js";
import { InitCheck } from "/ServerWeb/js/core/board.init.check.js";
import { GameView } from "/ServerWeb/js/views/game.view.js";

export const SocketController = {
    socket: null,

    async init() {
        this.socket = io();

        //Create New Game
        this.socket.on("board_connected", (data) => {
            if (!data || !data.gameID) return;
            const { gameID } = data;

            GameCardController.add(data.gameID);

            const controller = GameSyncManager.getController(gameID);
            if (controller) {
                GameView.setNotify("Board connected", "waiting", gameID); //notify state 
                InitCheck.startWaitingForBoard(controller, gameID);
            }
        });

        // Listen to restore data from server
        this.socket.on("restore_game", (data) => {
            document.dispatchEvent(
                new CustomEvent("socket:restore", { detail: data })
            );
        });

        this.socket.on("esp_move", (data) => {
            document.dispatchEvent(
                new CustomEvent("socket:move", { detail: data })
            );
        });

        //F5=> request the current state
        this.socket.on("connect", () => {
            const path = window.location.pathname;
            if (path.startsWith("/board/")) {
                const gameID = path.split("/")[2];

                this.socket.emit("join", { gameID }); //join room
                this.socket.emit("request_current_game", { gameID: gameID });
            }
        });

        this.socket.on("connect_error", (err) => {
            console.error("Connection Error: ", err);
        })
    },

    // join room when into board page
    joinRoom(gameID) {
        if (this.socket) {
            this.socket.emit("join", { gameID });
        }
    }
};