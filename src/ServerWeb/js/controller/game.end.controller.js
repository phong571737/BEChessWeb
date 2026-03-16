/**This file is used to handle end game (Checkmate)  */

export class GameEndController {
    constructor(gameController) {
        this.gameController = gameController;
    }

    async handleIfGameOver(boardUI) {
        console.log("handleIfGameOver called, saved:", this.gameController.saved);
        if (!this.gameController.isGameOver() || this.gameController.saved) return;

        this.gameController.saved = true;
        this._setHeaders();
        await this._saveGame();

        const {lastMove} = this.gameController;
        if (lastMove) boardUI.HighlightMove(lastMove.from, lastMove.to);
        boardUI.HighlightKing();
        boardUI.ui.update();
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

            document.dispatchEvent(new  CustomEvent("game:ended", {
                detail: game
            }));
        } catch (e) {
            console.log("Save game error: ", e);
        }
    }
}