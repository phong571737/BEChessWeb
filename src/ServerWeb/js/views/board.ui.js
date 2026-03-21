import { BoardMoveController } from "/ServerWeb/js/controller/board.move.controller.js";
import { BoardUIController } from "/ServerWeb/js/controller/board.ui.controller.js";

export class BoardUI {
    constructor(elementID, gameController){
        this.elementID = elementID;
        this.gameController = gameController;
        this.gameID = gameController.gameID;
        this.board = null;
        this.isPrimary = false; // flag handle end game
        this.ui = new BoardUIController(gameController);
        this.moveController = new BoardMoveController(gameController, this);
    }

    init() {
        this.board = Chessboard(this.elementID, {
            position: this.gameController.fen(), //Get current fen
            pieceTheme: '/lib/chessboardjs-1.0.0/img/chesspieces/wikipedia/{piece}.png',
        });
        this.ui.update();
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
    }

    HighlightSquare(square){
        $(`#${this.elementID} .square-${square}`).addClass('check');
        console.log(`Check king ${square}`);
    }

    RemoveHighlightKing() {
        $(`#${this.elementID} [class*="square-"]`).removeClass('check');
        // console.log("Remove check the king");
    }
}