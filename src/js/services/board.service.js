const initialBoard = [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],//black
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'], // white
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
];

function toSquare(row, col){
    const file = String.fromCharCode(97 + col); // a, b, c, ..., h
    const rank = 8 - row; // scan reverse row 1 -> 8
    return file + rank;
}

export function checkInitialBoard(board){
    const wrongSquares = [];
    const missingSquares = [];

    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){
            const expectBoard = initialBoard[r][c];
            const actualBoard = board[r][c];

            //Missing pieces when the board was initialized
            if(expectBoard !== ' ' && actualBoard === ' '){
                missingSquares.push(toSquare(r, c));
            }

            //expect != actual
            if(expectBoard !== ' ' && actualBoard !== ' ' && expectBoard !== actualBoard){
                wrongSquares.push(toSquare(r, c));
            }
            
            //the rows that difference with row 1, 2, 7, 8
            if(expectBoard === ' ' && actualBoard !== ' '){
                wrongSquares.push(toSquare(r, c));
            }
        }
    }
    return{
        status: wrongSquares.length === 0 && missingSquares.length === 0 ? "ok": "invalid",
        wrongSquares,
        missingSquares,
    }
}