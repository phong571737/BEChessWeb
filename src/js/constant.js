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
    NOTFOUND: "not_found",
    INVALID: "invalid_request",
    SERVER_ERROR: "server_error",
})

export const WAITING_STATUS = "waiting";
