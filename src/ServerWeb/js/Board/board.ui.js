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
            // draggable: true,
            position: this.gameController.fen(), //Get current fen
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
            this.ui.update();
        }
    }

    destroyBoard(){
        if(this.board) this.board.destroy();
    }

    onDragStart(source, piece, position, orientation) {
        // don't pick up pieces if the game is over
        if (this.gameController.isGameOver()) return false;

        if (this.gameController.turn() === 'w' && piece.search(/^b/) !== -1
        || this.gameController.turn() === 'b' && piece.search(/^w/) !== -1) {
            return false;
        }
    }

    update(){
        this.board.position(this.gameController.fen());
    }

    onSnapEnd() {
        this.update();
    }

    onDrop(source, target) {
        console.log("onDrop called!");
        console.log("this.gameID:", this.gameID);
        console.log("GameSyncManager:", GameSyncManager);

        console.log('From: ', source, 'to', target);
        let moveObj = {
            from: source,
            to: target,
            promotion: 'q'
        };

        const move = GameSyncManager.notifyMove(this.gameID, moveObj, this); //notify for all with id move
        if(!move){
            return 'snapback';
        }

        this.update();
        this.HighlightMove(moveObj.from, moveObj.to);
        this.HighlightKing();
        this.ui.update();
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