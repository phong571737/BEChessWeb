/**This file is used to handle end game (Checkmate)  */

export class GameEndController {
    constructor(gameController) {
        this.gameController = gameController;
    }

    async handleIfGameOver(boardUI) {
        if (!this.gameController.isGameOver() || this.gameController.saved) return;

        this.gameController.saved = true;
        this._setHeaders();
        this._saveGame();

        boardUI.HighlightMove(from, to);
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
            return await res.json();
        } catch (e) {
            console.log("Save game error: ", e);
        }
    }
}