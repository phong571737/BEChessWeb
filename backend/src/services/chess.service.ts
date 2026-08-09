import { Chess, PieceSymbol, Square } from "chess.js";
import { ValidMove } from "../types/chess.types.js";

export const ChessService = {
    // This function is used to clone fen state
    cloneFromFen(fen: string): Chess {
        return new Chess(fen);
    },

    // This function is used to apply a move
    applyMove(game: Chess, from: Square, to: Square, promotion?: PieceSymbol) {
        try {
            const result = game.move({ from, to, promotion });
            return result;
        } catch {
            return null;
        }
    },

    // this function is used to find all of moves validation
    findValidMove(game: Chess, candidates: string[]) {
        const valid: ValidMove[] = [];
        const seen = new Set<string>();

        console.log("findValidMove candidates:", candidates);

        for (const uci of [...candidates].reverse()) {
            const from = uci.slice(0, 2) as Square;
            const to = uci.slice(2, 4) as Square;
            const key = from + to;

            if (seen.has(key)) continue; // if key is in seen => skip

            const piece = game.get(from);
            const isPromotion = piece?.type === "p" &&
                ((piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1"));

            if (isPromotion && !uci[4]) {
                for (const promo of ["q", "r", "b", "n"]) {
                    const promoKey = from + to + promo;
                    if (seen.has(key)) continue;

                    try {
                        const result = game.move({ from, to, promotion: promo });
                        if (result) {
                            game.undo();
                            valid.push({ ...result, uci: from + to + promo });
                            seen.add(promoKey);
                        }
                    }
                    catch { }
                }
            } else {
                const promotion = uci[4] ?? undefined;
                const key = from + to + (promotion ?? "");
                if (seen.has(key)) continue;

                try {
                    const result = game.move({ from, to, promotion });
                    if (result) {
                        game.undo();
                        valid.push({ ...result, uci: from + to + (promotion ?? "") });
                        seen.add(key);
                    }
                }
                catch { }
            }
        }
        return valid;
    }
}