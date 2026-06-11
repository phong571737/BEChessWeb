import { BOARD_STATUS, BOARD_TYPE } from "../constant.js";

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

const initialBoardNFC = {
    a1:"R", b1:"N", c1:"B", d1:"Q", e1:"K", f1:"B", g1:"N", h1:"R",
    a2:"P", b2:"P", c2:"P", d2:"P", e2:"P", f2:"P", g2:"P", h2:"P",
    a7:"p", b7:"p", c7:"p", d7:"p", e7:"p", f7:"p", g7:"p", h7:"p",
    a8:"r", b8:"n", c8:"b", d8:"q", e8:"k", f8:"b", g8:"n", h8:"r",
};

/**
 * Check the state of initial board NFC
 * @params {Object} board 
 * @returns {
 *  status: BOARD_STATUS,
 *  missingSquares: string[], 
 *  extraSquares: string[],
 *  wrongPieceSquares: { square: string, expected: string, actual: string }[]
 * }
 */
export function checkInitialBoardNFC(board) {
    const missingSquares = [];
    const extraSquares = [];
    const wrongPieceSquares = []; // false piece type

    // Loop for all square 
    for (const [square, expectedPiece] of Object.entries(initialBoardNFC)) {
        const actualPiece = board[square];

        if (!actualPiece) {
            missingSquares.push(square);
        } else if (actualPiece !== expectedPiece) {
            wrongPieceSquares.push({
                square,
                expected: expectedPiece,
                actual: actualPiece,
            })
        }
    }

    // Check the squares that shouldn't the pieces but do
    for (const square of Object.keys(board)) {
        if (!initialBoardNFC[square]) {
            extraSquares.push(square);
        }
    }

    let status;
    if (extraSquares.length > 0 || wrongPieceSquares.length > 0) {
        status = BOARD_STATUS.WRONG_PIECE;
    } else if (missingSquares.length > 0 ) {
        status = BOARD_STATUS.MISSING_PIECE;
    } else {
        status = BOARD_STATUS.READY;
    }

    return { status, missingSquares, extraSquares, wrongPieceSquares};
}

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

    let status;
    if (wrongSquares.length > 0) status = BOARD_STATUS.WRONG_PIECE;
    else if (missingSquares.length > 0) status = BOARD_STATUS.MISSING_PIECE;
    else status = BOARD_STATUS.READY;

    return{ status, wrongSquares, missingSquares,}
}