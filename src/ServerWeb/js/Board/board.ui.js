import { GameController } from "/ServerWeb/js/game/game.controller.js";
import { UI } from "/ServerWeb/js/UI/ui.controller.js";

export class BoardUI {
    constructor(elementID, gameID){
        this.elementID = elementID;
        this.gameID = gameID;
        this.board = null;
    }

    init() {
        this.board = Chessboard(this.elementID, {
            // draggable: true,
            position: GameController.fen(), //Get current fen
            onDragStart: this.onDragStart.bind(this),
            onSnapEnd: this.onSnapEnd.bind(this),
            pieceTheme: '/lib/chessboardjs-1.0.0/img/chesspieces/wikipedia/{piece}.png',
            onDrop: this.onDrop.bind(this),
        });
    }

    renderUpdate(from, to){
        if(this.board){
            console.log("Render update is called");
            this.update();
            this.HighlightMove(from, to);
            this.HighlightKing();
            UI.update();
        }
    }

    destroyBoard(){
        if(this.board) this.board.destroy();
    }

    onDragStart(source, piece, position, orientation) {
        // don't pick up pieces if the game is over
        if (GameController.isGameOver()) return false;

        if (GameController.turn() === 'w' && piece.search(/^b/) !== -1
        || GameController.turn() === 'b' && piece.search(/^w/) !== -1) {
            return false;
        }
    }

    update(){
        this.board.position(GameController.fen());
    }

    onSnapEnd() {
        this.update();
    }

    onDrop(source, target) {
        console.log('From: ', source, 'to', target);
        let move;
        try {
            move = GameController.move(source, target);
        } catch (e) {
            return 'snapback'; // invalidation
        }

        this.HighlightMove(move.from, move.to);
        this.HightlightKing();
        UI.update();
    }

    /**add highlight when the piece is moved */
    HighlightMove(source, target) {
        this.RemoveHighlightMove();

        $(`#${this.elementID} .square-${source}`).addClass('last-move');
        $(`#${this.elementID} .square-${target}`).addClass('last-move');
    }

    RemoveHighlightMove() {
        $(`#${this.elementID} [class^="square-"]`).removeClass('last-move');
    }

    /**add highlight when the king is checked */
    HighlightKing() {
        this.RemoveHighlightKing();

        if(!GameController.inCheck()) return; // not check

        const kingsquare = GameController.FindKing(GameController.turn());
        if(kingsquare){
            this.HighlightSquare(kingsquare);
        }

        UI.update();
    }

    HighlightSquare(square){
        $(`#${this.elementID} .square-${square}`).addClass('check');
        console.log(`Check king ${square}`);
    }

    RemoveHighlightKing() {
        $(`#${this.elementID} [class^="square-"]`).removeClass('check');
        console.log("Remove check the king");
    }
}