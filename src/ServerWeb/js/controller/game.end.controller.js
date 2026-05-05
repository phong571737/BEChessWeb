/**This file is used to handle end game (Checkmate)  */

import { GameEndView } from "/ServerWeb/js/views/game.end.view.js";

export class GameEndController {
    constructor(gameController) {
        this.gameController = gameController;
    }

    async handleIfGameOver(boardUI) {
        if (!this.gameController.isGameOver() || this.gameController.saved) return;

        this.gameController.saved = true;
        this._setHeaders();
        await this._saveGame();

        const {lastMove} = this.gameController;
        if (lastMove) boardUI.HighlightMove(lastMove.from, lastMove.to);
        boardUI.HighlightKing();
        boardUI.ui.update();

        await this._showResult(boardUI);
    }

    _setHeaders() {
        this.gameController.setGameHeader();
        this.gameController.setHeader("White", this.gameController.WhiteName);
        this.gameController.setHeader("Black", this.gameController.BlackName);
    }

    async _saveGame() {
        const pgn = this.gameController.pgn();
        try {
            //fetch endgame to save game into db
            const res = await fetch(`/games/${this.gameController.gameID}/endgame`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ pgn })
            })
            const game = await res.json();

            // Reset server 
            await fetch(`/games/${this.gameController.gameID}/reset`, {
                method: "POST"
            });

            document.dispatchEvent(new  CustomEvent("game:ended", {
                detail: game
            }));
        } catch (e) {
            console.log("Save game error: ", e);
        }
    }

    async _showResult(boardUI) {
        const result = this.gameController.game.result?.() ?? this.gameController.game.pgn?.()?.match(/(\S+)$/)?.[1];
        const isCheckmate = this.gameController.game.isCheckmate?.();
        const isDraw = this.gameController.game.isDraw?.();
        const isStalemate = this.gameController.game.isStalemate?.();

        const winner = result === "1-0" ? "White" 
                     : result === "0-1" ? "Black" 
                     : null;

        const reason = isCheckmate ? "Checkmate"
                     : isStalemate ? "Stalemate"
                     : isDraw      ? "Draw"
                     : "Game Over";

        const boardEl = document.querySelector(`#${boardUI.elementID}`);
        if (!boardEl) return;

        const overlay = GameEndView.ResultOverlay({ winner, reason });
        boardEl.style.position = "relative";
        boardEl.appendChild(overlay);

        // Animate in
        requestAnimationFrame(() => {
            overlay.style.opacity = "1";
            overlay.style.transform = "scale(1)";
        });

        // Self remove after 3s
        await new Promise(r => setTimeout(r, 3000));

        overlay.style.opacity = "0";
        overlay.style.transform = "scale(0.95)";

        await new Promise(r => setTimeout(r, 400));
        overlay.remove();

        // Reset game
        this.gameController.reset();
        boardUI.board.start();
        // boardUI.RemoveHighlightMove();
        boardUI.RemoveHighlightKing();
        boardUI.ui.update();
    }
}