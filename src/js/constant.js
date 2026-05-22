export const VALID_MOVE = "";

// Move status 
export const MOVE_STATUS = Object.freeze({
    DUPLICATE:"duplicate",
    OUT_OF_SEQ: "out_of_order",
    ILLEGAL: "illegal",
    OK: "ok",
})

//Move type 
export const MOVE_TYPE = Object.freeze({
    NORMAL: "NORMAL", // normal move
    CAPTURE: "CAPTURE", // eat
    CASTLE: "CASTLE", // castling
    ENPASSANT: "ENPASSANT", //enpassant
    PROMOTE: "PROMOTE", // promtion
})

// Error status
export const ERROR_STATUS = Object.freeze({
    NOTFOUND: "GAME_NOT_FOUND",
    INVALID: "INVALID",
    SERVER_ERROR: "INTERNAL_SERVER_ERROR",
    MISS_BOARDID: "BOARD_ID_REQUIRED",
    RESIGN_ERROR: "RESIGN ERROR",
});

export const GAME_STATUS = Object.freeze({
    PLAYING: "playing",
    WAITING: "waiting",
    FINISHED: "finished",
    ACTIVE: "active",
    SCAN_FAIL: "scan_failed",
    ENDED: "ended"
});

export const BOARD_TYPE = Object.freeze({
    NFC: "NFC",
    HALL: "HALL",
});

export const BOARD_STATUS = Object.freeze({
    READY: "ready",
    CHECK_INIT: "checkinit",
    WRONG_PIECE: "wrong_piece",
    MISSING_PIECE: "missing_piece",
});
