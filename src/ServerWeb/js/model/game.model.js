import { Chess } from "/lib/chess.js/dist/esm/chess.js";

export class GameModel{
    constructor(gameID){
        this.game = new Chess();
        this.lastMove = null;
        this.WhiteName = "White";
        this.BlackName = "Black";
        this.saved = false;
        this._history = []; // save all moves
        this.cursor = -1; // current index

        if(typeof gameID === 'object' && gameID.gameID){
            this.gameID = gameID.gameID || gameID._id;
            this.lastMove = gameID.lastMove || null;
            this.WhiteName = gameID.WhiteName || "White";
            this.BlackName = gameID.BlackName || "Black";

            if(gameID.pgn){
                this.loadPGN(gameID.pgn);
            }else if(gameID.fen){
                this.loadFen(gameID.fen);
            }
        }else{
            this.gameID = gameID;
        }
    }

    loadPGN(pgn) {
        this.game.loadPgn(pgn);
        this._history = this.game.history({verbose: true});
        this.cursor = this._history.length - 1;
    }

    setHeader(key, value){ this.game.setHeader(key, value);}
    getHeaders(){ return this.game.getHeaders();}
    loadFen(fen) { this.game.load(fen);}
    turn() { return this.game.turn();}
    move(from, to) { return this.game.move({ from, to, promotion: 'q' });}
    undo() { return this.game.undo();}
    fen() { return this.game.fen();}
    pgn() { return this.game.pgn();}
    inCheck() { return this.game.inCheck();}
    isDraw() { return this.game.isDraw();}
    board(){ return this.game.board();}
    isCheckmate(){ return this.game.isCheckmate();}
    isGameOver() { return this.game.isGameOver();}

    // navigation
    goToStart() {
        this.cursor = -1;
        this.rebuildToCursor();
    }

    goToBack() {
        if (this.cursor < 0) return;
        this.cursor--;
        this.rebuildToCursor();
    }

    goToNext() {
        if (this.cursor > this._history.length - 1) return;
        this.cursor++;
        this.rebuildToCursor();
    }   

    goToEnd() {
        this.cursor = this._history.length - 1;
        this.rebuildToCursor(); 
    }

    rebuildToCursor() {
        this.game.reset();
        for(let i = 0; i <= this.cursor; i++) {
            const {from, to, promotion} = this._history[i];
            this.game.move({from, to, promotion});
        }
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

    /**This function is used to determine the winner player */
    getResult(){
        //Whichever side gets their turn loses
        if(this.isCheckmate()){
            return this.turn() === "w" ? "0-1": "1-0";
        }
        //draw
        if(this.isDraw()){
            return "1/2-1/2"
        }
        return "*";
    }

    /**This function is used to set time that a game was played */
    getFullDate(){
        const date = new Date();
        const year = date.getFullYear();//year
        const month = String(date.getMonth() + 1).padStart(2, "0");// make sure the month  has 2 digits
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}.${month}.${day}`;
    }

    /**This function is used to set header of pgn */
    setGameHeader(){
        const result = this.getResult();
        const date = this.getFullDate();
        this.setHeader("Site", window.location.host);
        this.setHeader("Date", date);
        this.setHeader("Result", result);
        this.setHeader("White", this.WhiteName);
        this.setHeader("Black", this.BlackName);
    }

    setInitialHeader(){
        this.setHeader("Site", window.location.host);
        this.setHeader("Date", this.getFullDate());
        this.setHeader("White", this.WhiteName);
        this.setHeader("Black", this.BlackName);
    }

    // Reset board 
    reset() {
        this.game.reset();
        this.lastMove = null;
        this.saved = false;
        this.setInitialHeader();
    }
}