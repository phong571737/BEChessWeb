/**This file is used to handle activities 
 * restart, rename
 */

import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";

export class GameActionController {
    constructor(gameController) {
        this.gameController = gameController;
    }

    init() {
        this._initRestart();
        this._initRename();
    }

    // Restart a game
    _initRestart() {
        const restart_btn = document.querySelector(".btn.restart");
        restart_btn?.addEventListener("click", () => {
            this._handleRestart();
        })
    }

    // Rename for black and white player
    _initRename() {
        document.getElementById("top-icon")
            ?.addEventListener("click", () => this._rename("Black", "black-name"));

        document.getElementById("bot-icon")
            ?.addEventListener("click", () => this._rename("White", "white-name"));
    }

    _rename(color, elementID) {
        const name = prompt(`Nhập tên ${color}`);
        if (!name?.trim()) return;

        document.getElementById(elementID).textContent = name;
        this.gameController.setHeader(color, name);
    }

    // The function handle restart game
    async _handleRestart() {
        if (!confirm("Bạn có chắc chắc muốn restart lại ván cờ không")) return;

        const {gameID} = this.gameController;
        try {
            //post restart game
            await fetch(`/games/${gameID}/restart`, {
                method: 'POST'
            });
    
            //Reset board client
            this.gameController.game.reset();
            this.gameController.lastMove = null;
    
            const board = GameSyncManager.getBoards(gameID);
            if (board) {
                board.forEach(boardUI => {
                    boardUI.update();
                    boardUI.RemoveHighlightKing(); // remove highlight king if you're in checkmate
                    boardUI.RemoveHighlightMove();
                });
            }
        } catch(e) {
            console.error("Restart error: ", e);
        }
    }
}