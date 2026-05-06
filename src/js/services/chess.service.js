import { Chess } from "chess.js";

export const ChessService = {
    // This function is used to clone fen state
    cloneFromFen(fen) {
        return new Chess(fen);
    },

    // This function is used to apply a move
    applyMove(game, from, to, promotion) {
        try {
            const result = game.move({ from, to, promotion });
            return result;
        } catch {
            return null;
        }
    },

    // this function is used to find all of moves validation
    findValidMove(game, candidates) {
        const valid = [];
        const seen = new Set();

        console.log("findValidMove FEN:", game.fen());  // ← FEN này có khác parseCaptureMove không?
        console.log("findValidMove candidates:", candidates);

        for (const uci of [...candidates].reverse()) {
            const from = uci.slice(0, 2);
            const to = uci.slice(2, 4);
            const key = from + to;

            if (seen.has(key)) continue; // if key is in seen => skip

            const piece = game.get(from);
            const isPromotion = piece?.type === "p" &&
                ((piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1"));

            const promotion = uci[4] ?? (isPromotion ? "q" : undefined);

            try {
                const result = game.move({ from, to, promotion });
                if (result) {
                    game.undo();
                    valid.push({ from, to, promotion, uci: from + to + (promotion ?? "") });
                    seen.add(key);
                }
            }
            catch { }
        }

        return valid;
    }

    
}