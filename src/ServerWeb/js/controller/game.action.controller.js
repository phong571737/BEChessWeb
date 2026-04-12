/**This file is used to handle activities 
 * restart, rename
 */

import { ModalView } from "/ServerWeb/js/views/modal.view.js";
import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";
import { GameLoader } from "/ServerWeb/js/core/game.loader.js";

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
        }, {signal})
    }

    // Rename for black and white player
    _initRename(signal) {
        document.getElementById("top-icon")
            ?.addEventListener("click", () => this._rename("Black", "black-name"), {signal});

        document.getElementById("bot-icon")
            ?.addEventListener("click", () => this._rename("White", "white-name"), {signal});
    }

    _initSurrender(signal) {
        const surrender = document.querySelector(".btn.surrender");
        surrender?.addEventListener("click", () => {
            this._handleSurrender();
        }, {signal})
    }

    _rename(color, elementID) {
        const name = prompt(`Nhập tên ${color}`);
        if (!name?.trim()) return;

        document.getElementById(elementID).textContent = name;
        this.gameController.setHeader(color, name);
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
                localStorage.removeItem(`game_state_${gameID}`);
                
                //Reset board client
                this.gameController.game.reset();
                this.gameController.lastMove = null;
    
                const board = GameSyncManager.getBoards(gameID);
                if (board) {
                    board.forEach(boardUI => {
                        boardUI.update();
                        boardUI.ui.update();
                        boardUI.RemoveHighlightKing();
                        boardUI.RemoveHighlightMove();
                    });
                }
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

                // Reset server 
                await fetch(`/games/${this.gameController.gameID}/reset`, {
                    method: "POST"
                });

                localStorage.removeItem(`game_state_${gameID}`);
                // Reset board
                this.gameController.game.reset();
                this.gameController.lastMove = null;

                const boards = GameSyncManager.getBoards(gameID);
                boards?.forEach(boardUI => {
                    boardUI.update();
                    boardUI.ui.update();
                    boardUI.RemoveHighlightKing();
                    boardUI.RemoveHighlightMove();
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