import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";
import { GameCardController } from "/ServerWeb/js/controller/game.card.controller.js";

export const SocketController = {
    socket: null,

    async init() {
        this.socket = io();

        //Create New Game
        this.socket.on("create_game", (data) => {

            if (data && data.gameID) {
                GameCardController.add(data.gameID);
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
};