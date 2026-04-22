/**
 * This file is used to handle activities 
 * restart, rename
 */

import { ModalView } from "/ServerWeb/js/views/modal.view.js";
import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";
import { getSocket } from "../socket/socket.instance.js";
import { ViewManager } from "../core/view.manager.js";

export class GameActionController {
    constructor(gameController) {
        this.gameController = gameController;
        this.abortController = null;
    }

    init() {
        // Destroy old listener
        this.abortController?.abort();
        this.abortController = new AbortController();
        const { signal } = this.abortController;


        this._initRestart(signal);
        this._initRename(signal);
        this._initSurrender(signal);
    }

    // Restart a game
    _initRestart(signal) {
        const restart_btn = document.querySelector(".btn.restart");
        restart_btn?.addEventListener("click", () => {
            this._handleRestart();
        }, { signal })
    }

    // Rename for black and white player
    _initRename(signal) {
        document.getElementById("top-icon")
            ?.addEventListener("click", () => this._rename("Black", "black-name"), { signal });

        document.getElementById("bot-icon")
            ?.addEventListener("click", () => this._rename("White", "white-name"), { signal });
    }

    _initSurrender(signal) {
        const surrender = document.querySelector(".btn.surrender");
        surrender?.addEventListener("click", () => {
            this._handleSurrender();
        }, { signal })
    }

    async _rename(color, elementID) {
        const name = prompt(`Nhập tên ${color}`);
        if (!name?.trim()) return;
        
        const {gameID} = this.gameController;

        // update UI
        document.getElementById(elementID).textContent = name;
        this.gameController.setHeader(color, name);

        if (color === "Black") {
            this.gameController.BlackName = name;
        } else {
            this.gameController.WhiteName = name;
        }
        const key = `game_state_${gameID}`;
        const oldState = JSON.parse(localStorage.getItem(key) || "{}");
        // save state to reload not destroy
        const newState = {
            ...oldState,
            WhiteName: this.gameController.WhiteName || "White",
            BlackName: this.gameController.BlackName || "Black",
        }
        localStorage.setItem(key, JSON.stringify(newState));

        try {
            //post restart game
            await fetch(`/games/${gameID}/rename`, {
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({color, name}),
            });
        } catch (e) {
            console.error("Rename error: ", e);
        }
    }

    // The function handle restart game
    async _handleRestart() {
        if (document.querySelector(".restart-dialog[open]")) return;
        const modal = ModalView.showRestartModal();

        // close modal
        const close = () => {
            modal.modal_container.close();
            modal.modal_container.remove();
        };

        modal.abort.addEventListener('click', () => {
            close();
        });
        modal.confirm.addEventListener('click', async () => {
            close();

            const { gameID } = this.gameController;
            try {
                //post restart game
                await fetch(`/games/${gameID}/restart`, {
                    method: 'POST'
                });

                ViewManager.updateEvalBar(0, gameID); // reset eval

                // notify to server
                getSocket().emit("restart", {
                    gameID
                });
            } catch (e) {
                console.error("Restart error: ", e);
            }
        })
    }

    // Handle surrender event
    _handleSurrender() {
        if (document.querySelector(".resign-dialog[open]")) return;

        const modal = ModalView.showResignModal();
        const close = () => {
            modal.modal_container.close();
            modal.modal_container.remove();
        };

        modal.closeBtn.addEventListener("click", () => {
            close();
        });

        const resign = async (resignSide) => {
            const { gameID } = this.gameController;
            try {
                await fetch(`/games/${gameID}/resign`, {
                    method: 'POST',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ resignSide }),
                })
                close();

                ViewManager.updateEvalBar(0, gameID); // reset eval

                // emit to client to update web 
                getSocket().emit("resign", {
                    gameID,
                    resignSide
                });
            } catch (e) {
                console.error("Resign error:", e);
            }
        };

        modal.btn_white.addEventListener("click", () => resign("white"));
        modal.btn_black.addEventListener("click", () => resign("black"));
    }

    destroy() {
        this.abortController?.abort();
    }
}