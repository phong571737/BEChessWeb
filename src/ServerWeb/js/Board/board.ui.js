import { GameSyncManager } from "/ServerWeb/js/game/game.syncmanager.js";
import { GameController } from "/ServerWeb/js/game/game.controller.js";
import { UI } from "/ServerWeb/js/UI/ui.controller.js";

export class BoardUI {
    constructor(elementID, gameController){
        console.log("BoardUI received:", gameController);
        console.log("Type:", typeof gameController);
        console.log("Has fen?", gameController?.fen);
        this.elementID = elementID;
        this.gameController = gameController;
        this.gameID = gameController.gameID;
        this.board = null;
        this.ui = new UI(gameController);
    }

    init() {
        this.board = Chessboard(this.elementID, {
            position: this.gameController.fen(), //Get current fen
            pieceTheme: '/lib/chessboardjs-1.0.0/img/chesspieces/wikipedia/{piece}.png',
        });

        this.ui.update();
    }

    async renderUpdate(from, to){
        if(this.board){
            console.log("Render update is called");
            this.update();
            this.HighlightMove(from, to);
            this.HighlightKing();
            this.ui.update();

            // checkmate
            if (this.gameController.isGameOver() && !this.gameController.saved){
                console.log("Game ended");
                this.gameController.saved = true;
                this.gameController.setGameHeader();
                this.gameController.setHeader("White", this.gameController.WhiteName);
                this.gameController.setHeader("Black", this.gameController.BlackName);
                const pgn = this.gameController.pgn();
                try{
                    //fetch endgame to save game into db
                    const res = await fetch(`/games/${this.gameController.gameID}/endgame`, {
                        method: "POST",
                        headers:{
                            "Content-Type": "application/json" 
                        },
                        body: JSON.stringify({pgn})
                    })
                    const data = await res.json();
                }catch(e){
                    console.log("Save game error: ", e);
                }
            }
        }
    }

    destroyBoard(){
        if(this.board) this.board.destroy();
    }

    update(){
        this.board.position(this.gameController.fen());
    }

    onSnapEnd() {
        this.update();
    }

    /**add highlight when the piece is moved */
    HighlightMove(source, target) {
        this.RemoveHighlightMove();

        $(`#${this.elementID} .square-${source}`).addClass('last-move');
        $(`#${this.elementID} .square-${target}`).addClass('last-move');
    }

    RemoveHighlightMove() {
        $(`#${this.elementID} [class*="square-"]`).removeClass('last-move');
    }

    /**add highlight when the king is checked */
    HighlightKing() {
        this.RemoveHighlightKing();

        if(!this.gameController.inCheck()) return; // not check

        const kingsquare = this.gameController.FindKing(this.gameController.turn());
        if(kingsquare){
            this.HighlightSquare(kingsquare);
        }

        this.ui.update();
    }

    HighlightSquare(square){
        $(`#${this.elementID} .square-${square}`).addClass('check');
        console.log(`Check king ${square}`);
    }

    RemoveHighlightKing() {
        $(`#${this.elementID} [class*="square-"]`).removeClass('check');
        console.log("Remove check the king");
    }
}