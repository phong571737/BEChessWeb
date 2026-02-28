import { Chess } from "/lib/chess.js/dist/esm/chess.js";

export class GameController{
    constructor(gameID){
        this.game = new Chess();
        this.lastMove = null;

        if(typeof gameID === 'object' && gameID.gameID){
            this.gameID = gameID.gameID || gameID._id;
            this.lastMove = gameID.lastMove || null;

            if(gameID.pgn){
                this.loadPGN(gameID.pgn);
            }else if(gameID.fen){
                this.loadFen(gameID.fen);
            }
            console.log("Restore controller: ", this.gameID);
        }else{
            this.gameID = gameID;
            console.log("Create controller for:", this.gameID);
        }
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

    board(){
        return this.game.board();
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

    /**This function is used to get the captured pieces */
    getCapturedPieces(){
        const initboard = {p: 8, b: 2, n: 2, r: 2, q: 1, k: 1};
        const count = {
            w: {p: 0, b: 0, n: 0, r: 0, q: 0, k: 0},
            b: {p: 0, b: 0, n: 0, r: 0, q: 0, k: 0}
        }
        const captured = {
            w: {},
            b: {}
        }
        const board = this.board();

        //Count the remaining pieces on the board
        for(let row of board){
            for(let sq of row){
                if(!sq) continue;
                count[sq.color][sq.type]++;
            }
        }

        //Count the captured pieces 
        for(let i in initboard){
            captured.w[i] = initboard[i] - count.w[i];
            captured.b[i] = initboard[i] - count.b[i];
        }

        console.log("Captured: ", captured);
        return captured;
    }

    /**This function is used to calc material advantage*/
    getPointPieces(){
        const valuePieces = {p: 1, b: 3, n: 3, r: 5, q: 9, k: 0};
        let points = 0;

        for(let row of this.board()){
            for(let sq of row){
                if(!sq) continue;

                const val = valuePieces[sq.type] || 0;
                points += sq.color === "w" ? val : -val; //>0 white, < 0 black, == 0: balance
            }
        }
        return points;
    }

}