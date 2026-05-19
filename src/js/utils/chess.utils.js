import { MOVE_STATUS } from "../constant.js";


export function parseUCI(uci) {
    return {
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length === 5 ? uci[4] : undefined
    }
}

export function formatUCI(from, to, promotion) {
    return from + to + (promotion ?? "");
}

export function buildResponse(gameID, game, seq, extra = {}) {
    return {
        status: MOVE_STATUS.OK,
        gameID,
        fen: game.fen(),
        pgn: game.pgn(),
        lastSeq: seq,
        ...extra
    }
}

// This function is used to execute move
export function executeMove(game, move) {
    return game.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion
    }) 
}