const initialBoard = [
    [1, 1, 1, 1, 1, 1, 1, 1], // row 0 - black
    [1, 1, 1, 1, 1, 1, 1, 1], // row 1
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1], // row 6 - white
    [1, 1, 1, 1, 1, 1, 1, 1], // row 7
];

function toSquare(row, col){
    const file = String.fromCharCode(97 + col); // a, b, c, ..., h
    const rank = 8 - row; // scan reverse row 1 -> 8
    return file + rank;
}

export function convertHalltoBoard(hallArr) {
    return [...hallArr].reverse().map(rowBits =>
        Array.from({length: 8}, (_, c) =>
            (rowBits >> (c)) & 1
        )
    );
}

export function checkInitialBoard(board){
    const wrongSquares = [];
    const missingSquares = [];

    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){
            const expectBoard = initialBoard[r][c];
            const actualBoard = board[r][c];

            //Missing pieces when the board was initialized
            if(expectBoard === 1 && actualBoard === 0){
                missingSquares.push(toSquare(r, c));
            }

            //wrongsquare
            if(expectBoard === 0 && actualBoard === 1){
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