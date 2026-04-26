/**
 * This file is used to handle activities 
 * restart, rename
 */

import { ModalView } from "/ServerWeb/js/views/modal.view.js";
import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";
import { getSocket } from "../socket/socket.instance.js";
import { ViewManager } from "../core/view.manager.js";
import { eventBus } from "../utils/eventbus.instance.js";
import { GameStore } from "../utils/game.store.js";

export class GameActionController {
    constructor(gameController) {
        this.gameController = gameController;
        this.abortController = null;
    }

    init() {
        const {gameID} = this.gameController;

        // Destroy old listener
        this.abortController?.abort();
        this.abortController = new AbortController();
        const { signal } = this.abortController;

        this.viewEl = document.getElementById(`view-game-${gameID}`);

        this._initRestart(signal);
        this._initRename(signal);
        this._initSurrender(signal);
        this._initStateButton(signal);
    }

    // Restart a game
    _initRestart(signal) {
        const restart_btn = this.viewEl.querySelector(".btn.restart");
        restart_btn?.addEventListener("click", () => {
            this._handleRestart();
        }, { signal })
    }

    // Rename for black and white player
    _initRename(signal) {
        const top = this.viewEl?.querySelector(".top-icon")
        top?.addEventListener("click", () => this._rename("Black", "black-name"), { signal });

        this.viewEl?.querySelector(".bot-icon")
            ?.addEventListener("click", () => this._rename("White", "white-name"), { signal });
    }

    // surrender button
    _initSurrender(signal) {
        const surrender = this.viewEl.querySelector(".btn.surrender");
        surrender?.addEventListener("click", () => {
            this._handleSurrender();
        }, { signal })
    }

    _initStateButton(signal) {
        const backward_btn = this.viewEl.querySelector(".btn.backward-fast");
        const back_btn = this.viewEl.querySelector(".btn.backward");
        const forward_btn = this.viewEl.querySelector(".btn.forward");
        const forwardfast_btn = this.viewEl.querySelector(".btn.forward-fast");

        // backward btn
        backward_btn?.addEventListener("click", () => {
            this.navigationTo("start");
        }, {signal});

        // back btn
        back_btn?.addEventListener("click", () => {
            this.navigationTo("back");
        }, {signal});

        // next btn
        forward_btn?.addEventListener("click", () => {
            this.navigationTo("next");
        }, {signal});

        // end btn
        forwardfast_btn?.addEventListener("click", () => {
            this.navigationTo("end");
        }, {signal});
    }

    navigationTo(dir){
        switch(dir) {
            case "start": 
                this.gameController.goToStart();
                break;
            case "back":
                this.gameController.goToBack();
                break;
            case "next":
                this.gameController.goToNext();
                break;
            case "end":
                this.gameController.goToEnd();
                break;
        }

        const {gameID} = this.gameController;
        GameStore.set(gameID, {
            fen: this.gameController.fen(),
            pgn: this.gameController.pgn(),
        });

        eventBus.emit("game:update", gameID);
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
        this.viewEl = null;
    }
}