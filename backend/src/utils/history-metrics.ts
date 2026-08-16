/**
 * Returns the number of accepted half-moves (plies) represented by a game
 * snapshot. FEN history is the canonical persisted timeline for this app.
 * Legacy UCI history is used only when an older document has no FEN timeline.
 */
export function countHistoryPlies(value: Record<string, unknown>): number {
    // A persisted FEN timeline includes the starting position at index 0;
    // only subsequent snapshots represent accepted half-moves (plies).
    if (Array.isArray(value.fenHistory)) return Math.max(0, value.fenHistory.length - 1);
    if (Array.isArray(value.uciHistory)) return value.uciHistory.length;
    return 0;
}

/** Returns the latest persisted position without parsing the PGN cache. */
export function currentHistoryFen(value: Record<string, unknown>): string | undefined {
    if (typeof value.currentFen === "string" && value.currentFen.trim()) return value.currentFen;
    if (Array.isArray(value.fenHistory)) {
        const last = value.fenHistory.at(-1);
        if (typeof last === "string" && last.trim()) return last;
    }
    return typeof value.fen === "string" && value.fen.trim() ? value.fen : undefined;
}
