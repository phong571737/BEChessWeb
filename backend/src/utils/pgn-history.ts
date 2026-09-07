import { PieceSymbol, Square } from "chess.js";
import { MoveLike } from "../types/chess.types.js";
import { customPGN } from "./custom.chess.js";
import { inferMoveFromFen } from "./chess.utils.js";


type ResolvedPgnMove = {
    move: MoveLike;
    afterFen: string;
}

type BuildPgnResult = {
    pgn: string;
    moves: ResolvedPgnMove[];
}

const UCI_PATTERN = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i;

function uciToMove(uci: string): MoveLike | null {
    const match = uci.match(UCI_PATTERN);
    if (!match) return null;
    return {
        from: match[1] as Square,
        to: match[2] as Square,
        promotion: match[3]?.toLowerCase() as PieceSymbol | undefined,
    };
}

function changedPlacement(beforeFen: string | undefined, afterFen: string | undefined): boolean {
    return Boolean(beforeFen?.trim() && afterFen?.trim()
        && beforeFen.trim().split(/\s+/)[0] !== afterFen.trim().split(/\s+/)[0]);
}

/**
 * Produces the live-board notation from the raw board snapshots. UCI remains
 * the preferred source, while a unique FEN transition supplies a missing UCI.
 * A state-changing transition which cannot be resolved remains an X marker.
 */
export function buildPgnFromBoardHistory({
    initialFen, uciHistory, fenHistory, headers
}: {initialFen?: string; uciHistory: string[]; fenHistory: string[]; headers?: Record<string, string>}): BuildPgnResult {
    let previousFen = initialFen;
    const resolvedMoves: ResolvedPgnMove[] = [];
    const eventCount = Math.max(uciHistory.length, fenHistory.length);

    for (let index = 0; index < eventCount; index++) {
        const afterFen = fenHistory[index];
        const uci = uciHistory[index]?.trim() ?? "";
        if (!afterFen?.trim()) continue;

        const move = uciToMove(uci) ?? (previousFen ? inferMoveFromFen(previousFen, afterFen) : null);

        if (move) {
            resolvedMoves.push({ move, afterFen });
        } else if (changedPlacement(previousFen, afterFen)) {
            resolvedMoves.push({ move: { from: "--" as Square, to: "--" as Square }, afterFen });
        }

        // Always advance the authoritative snapshot, including a clock-only
        // event. This keeps later moves in their correct side/column.
        previousFen = afterFen;
    }

    return {
        pgn: customPGN(
            resolvedMoves.map((item) => item.move),
            initialFen,
            headers,
            resolvedMoves.map((item) => item.afterFen),
    ).pgn,
    moves: resolvedMoves,
  };
}
