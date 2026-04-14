import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";
import { GameCardController } from "/ServerWeb/js/controller/game.card.controller.js";
import { InitCheck } from "/ServerWeb/js/core/board.init.check.js";
import { GameView } from "/ServerWeb/js/views/game.view.js";
import { initSocket } from "./socket.instance.js";

export const SocketController = {
    socket: null,

    async init() {
        this.socket = initSocket();

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

        // Listen move event
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

        this.socket.on("update_all_game", (data) => {
            if (!data || !data.gameID) return;
            const { gameID } = data;

            localStorage.removeItem(`game_state_${gameID}`);

            // Reset board
            const controller = GameSyncManager.getController(gameID);
            if (controller) {
                controller.game.reset();
                controller.lastMove = null;
            }

            const boards = GameSyncManager.getBoards(gameID);
            boards?.forEach(boardUI => {
                boardUI.update();
                boardUI.ui.update();
                boardUI.RemoveHighlightKing();
                boardUI.RemoveHighlightMove();
            });
        })

        this.socket.on("game:renamed", ({color, name}) => {
            const id = color === "Black" ? "black-name" : "white-name";
            document.getElementById(id).textContent = name;
        })

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