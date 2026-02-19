import { Chess } from "/lib/chess.js/dist/esm/chess.js";

export class GameController{
    constructor(gameID){
        this.gameID = gameID;
        this.game = new Chess();
        this.lastMove = null;

        console.log("Create controller for:", gameID);
        console.log("Chess instance:", this.game);
    }

    loadFen(fen) {
        this.game.load(fen);
    }

    loadPGN(pgn) {
        this.game.loadPgn(pgn);
    }

    turn() {
        return this.game.turn();
    }

    move(from, to) {
        console.log("Before move FEN:", this.game.fen());
        return this.game.move({ from, to, promotion: 'q' });
    }

    undo() {
        return this.game.undo();
    }

    fen() {
        return this.game.fen();
    }

    pgn() {
        return this.game.pgn();
    }

    inCheck() {
        return this.game.inCheck();
    }

    isDraw() {
        return this.game.isDraw();
    }

    isGameOver() {
        return this.game.isGameOver();
    }

    FindKing(color) {
        const board = this.game.board();
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                /**the king that you're looking for */
                const piece = board[r][c];
                if (piece && piece.type === 'k' && piece.color === color) {
                    const file = 'abcdefgh'[c]; // assign the string to index
                    const rank = 8 - r;
                    return file + rank;
                }
            }
        }
    }

    makeMove(move){
        const moved = this.game.move(move);

        if(moved){
            this.lastMove = move;
        }
        return moved;
    }

}