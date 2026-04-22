import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";
import { GameCardController } from "/ServerWeb/js/controller/game.card.controller.js";
import { initSocket } from "./socket.instance.js";
import { ViewManager } from "../core/view.manager.js";
import { BoardEvent } from "./socket.board.js";
import { EvalEvent } from "./socket.eval.js";
import { GameEvent } from "./socket.game.js";

export const SocketController = {
    socket: null,

    async init() {
        this.socket = initSocket();

        BoardEvent(this.socket);
        EvalEvent(this.socket);
        GameEvent(this.socket);

        this.registerConnection();
        this.registerErrors();
    },

    registerConnection() {
        //F5=> request the current state
        this.socket.on("connect", () => {
            const path = window.location.pathname;
            if (path.startsWith("/board/")) {
                const gameID = path.split("/")[2];

                this.socket.emit("join", { gameID }); //join room
                this.socket.emit("request_current_game", { gameID: gameID });
            }
        });
    },

    registerErrors() {
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