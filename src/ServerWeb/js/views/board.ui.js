import { BoardMoveController } from "/ServerWeb/js/controller/board.move.controller.js";
import { BoardUIController } from "/ServerWeb/js/controller/board.ui.controller.js";

export class BoardUI {
    constructor(elementID, gameController) {
        this.elementID = elementID;
        this.gameController = gameController;
        this.gameID = gameController.gameID;
        this.board = null;
        this.isPrimary = false; // flag handle end game
        this.lastFrom = null;
        this.lastTo = null;
        this.ui = new BoardUIController(gameController);
        this.moveController = new BoardMoveController(gameController, this);
        this.windowResizeHandle = null;
    }

    init() {
        this.board = Chessboard(this.elementID, {
            responsive: true,
            position: this.gameController.fen(), //Get current fen
            pieceTheme: '/lib/chessboardjs-1.0.0/img/chesspieces/wikipedia/{piece}.png',
        });
        this.initResizeObserver();
        this.ui.update();
    }

    initResizeObserver() {
        let ResizeTimer;
        this.windowResizeHandle = () => {
            clearTimeout(ResizeTimer);
            ResizeTimer = setTimeout(() => {
                this.board.resize();
                this.HighlightMove(this.lastFrom, this.lastTo);
                this.HighlightKing();
                this.syncPlayerWidth();
            }, 20);
        };

        this.syncPlayerWidth();
        window.addEventListener('resize', this.windowResizeHandle);
    }

    syncPlayerWidth() {
        const viewEl = document.getElementById(`view-game-${this.elementID.replace('Board_', '')}`);
        if (!viewEl || viewEl.style.display === "none") return;

        const boardEl = viewEl.querySelector(`#${this.elementID} .board-b72b1`);
        const botPlayer = viewEl.querySelector('.bot-player');
        const topPlayer = viewEl.querySelector('.top-player');

        if (!boardEl || !botPlayer || !topPlayer) return;
        
        botPlayer.style.width = boardEl.getBoundingClientRect().width + 'px';
        topPlayer.style.width = boardEl.getBoundingClientRect().width + 'px';
    }

    destroyBoard() {
        if (this.board) this.board.destroy();
    }

    update() {
        this.board.position(this.gameController.fen());
    }

    clearAllHighlight() {
        this.update();
        this.RemoveHighlightKing();
        this.RemoveHighlightMove();
    }

    /**add highlight when the piece is moved */
    HighlightMove(source, target) {
        this.RemoveHighlightMove();
        this.lastFrom = source;
        this.lastTo = target;

        $(`#${this.elementID} .square-${source}`).addClass('last-move');
        $(`#${this.elementID} .square-${target}`).addClass('last-move');
    }

    RemoveHighlightMove() {
        if (this.lastFrom) {
            const el = document.querySelector(`#${this.elementID} .square-${this.lastFrom}`);
            $(`#${this.elementID} .square-${this.lastFrom}`).removeClass('last-move');
        } if (this.lastTo) {
            $(`#${this.elementID} .square-${this.lastTo}`).removeClass('last-move');
        }
    }

    /**add highlight when the king is checked */
    HighlightKing() {
        this.RemoveHighlightKing();

        if (!this.gameController.inCheck()) return; // not check

        const kingsquare = this.gameController.FindKing(this.gameController.turn());
        if (kingsquare) {
            this.HighlightSquare(kingsquare);
        }
    }

    HighlightSquare(square) {
        $(`#${this.elementID} .square-${square}`).addClass('check');
        console.log(`Check king ${square}`);
    }

    RemoveHighlightKing() {
        $(`#${this.elementID} [class*="square-"]`).removeClass('check');
    }

    // Highlight when init wrong
    HighlightInitErrors(wrongSq, missingSq) {
        wrongSq.forEach(sq => {
            $(`#${this.elementID} .square-${sq}`).addClass('highlightwrong');
        });

        missingSq.forEach(sq => {
            $(`#${this.elementID} .square-${sq}`).addClass('highlightmissing');
        });
    }

    ClearHighlightInitErrors() {
        $(`#${this.elementID} [class*="square-"]`).removeClass('highlightwrong');
        $(`#${this.elementID} [class*="square-"]`).removeClass('highlightmissing');
    }
}