"use client"

interface Props {
    /** Centipawns from White's perspective. Ignored when `mate` is set. */
    cp?: number | null;
    /** Mate in N from White's perspective (+ = White mates, − = Black mates). */
    mate?: number | null;
    orientation?: "vertical" | "horizontal";
    /** Mirrors the evaluation bar with the board orientation. */
    flipped?: boolean;
    /** True while Stockfish is calculating the displayed position. */
    isAnalyzing?: boolean;
    /** True when the Stockfish worker could not start or communicate. */
    engineUnavailable?: boolean;
}

/** Lichess winning-chances → [0, 1] share for White (see lichess-org/lila). */
function whiteWinShare(cp: number | null | undefined, mate: number | null | undefined): number {
    if (mate != null && mate !== 0) {
        // A forced mate is decisive. Do not turn it into an artificial
        // centipawn score because that makes a mate in 10 look uncertain.
        return mate > 0 ? 0.99 : 0.01;
    }
    if (cp == null || Number.isNaN(cp)) return 0.5;
    const clamped = Math.max(-1000, Math.min(1000, cp));
    return (rawWinningChances(clamped) + 1) / 2;
}

function rawWinningChances(cp: number): number {
    // https://github.com/lichess-org/lila/pull/11148
    return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
}

/** Format like Lichess / Chess.com: +1.2, −0.5, #3, #−2 */
function formatEval(cp: number | null | undefined, mate: number | null | undefined): string {
    if (mate != null && mate !== 0) {
        return mate > 0 ? `#${mate}` : `#−${Math.abs(mate)}`;
    }
    if (cp == null || Number.isNaN(cp)) return "0.0";
    const pawns = cp / 100;
    const abs = Math.abs(pawns);
    // Cap displayed magnitude like common UIs (huge advantages still read as ±99.9)
    const shown = Math.min(abs, 99.9).toFixed(1);
    if (pawns > 0) return `+${shown}`;
    if (pawns < 0) return `−${shown}`;
    return "0.0";
}

export function EvalBar({ cp = null, mate = null, orientation = "vertical", flipped = false, isAnalyzing = false, engineUnavailable = false }: Props) {
    const hasEval = mate != null || (cp != null && !Number.isNaN(cp));
    const whitePct = whiteWinShare(cp, mate) * 100;
    const blackPct = 100 - whitePct;
    const label = hasEval ? formatEval(cp, mate) : (isAnalyzing ? "…" : "|");
    const whiteAhead = hasEval ? (mate != null ? mate > 0 : (cp ?? 0) >= 0) : true;

    if (!hasEval) {
        return orientation === "horizontal" ? (
            <div className="eval-bar eval-bar--horizontal relative flex h-5 w-full items-center justify-center overflow-hidden border border-border bg-muted">
                <span className="font-mono text-[10px] leading-none text-muted-foreground tabular-nums">{isAnalyzing ? "…" : engineUnavailable ? "!" : "|"}</span>
            </div>
        ) : (
            <div className="eval-bar eval-bar--vertical relative flex h-full w-full items-center justify-center overflow-hidden border border-border bg-muted">
                <span className="font-mono text-[9px] leading-none text-muted-foreground tabular-nums">{isAnalyzing ? "…" : engineUnavailable ? "!" : "|"}</span>
            </div>
        );
    }

    if (orientation === "horizontal") {
        return (
            <div className="eval-bar eval-bar--horizontal relative w-full h-5 overflow-hidden border border-border">
                <div
                    className="absolute inset-y-0 bg-[#403d39] transition-[width] duration-500 ease-out"
                    style={{ width: `${blackPct}%`, left: flipped ? "auto" : 0, right: flipped ? 0 : "auto" }}
                />
                <div
                    className="absolute inset-y-0 bg-[#f0f0f0] transition-[width] duration-500 ease-out"
                    style={{ width: `${whitePct}%`, left: flipped ? 0 : "auto", right: flipped ? "auto" : 0 }}
                />
                <div
                    className="absolute inset-y-0 flex items-center px-1.5 pointer-events-none"
                    style={{
                        left: whiteAhead === flipped ? 0 : "auto",
                        right: whiteAhead === flipped ? "auto" : 0,
                    }}
                >
                    <span
                        className="font-mono text-[10px] leading-none select-none tabular-nums"
                        style={{ color: whiteAhead ? "#1a1a1a" : "#f0f0f0" }}
                    >
                        {label}
                    </span>
                </div>
            </div>
        );
    }

    // Vertical bar follows the rendered board orientation.
    return (
        <div className="eval-bar eval-bar--vertical relative h-full w-full overflow-hidden border border-border bg-[#f0f0f0]">
            <div
                className="absolute inset-x-0 bg-[#403d39] transition-[height] duration-500 ease-out"
                style={{ height: `${blackPct}%`, top: flipped ? "auto" : 0, bottom: flipped ? 0 : "auto" }}
            />
            {/* Midline tick (equal position) */}
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-px bg-black/25 pointer-events-none" />

            <div
                className="absolute inset-x-0 flex justify-center pointer-events-none"
                style={{
                    top: whiteAhead === flipped ? 4 : "auto",
                    bottom: whiteAhead === flipped ? "auto" : 4,
                }}
            >
                <span
                    className="font-mono text-[9px] leading-none select-none tabular-nums"
                    style={{ color: whiteAhead ? "#1a1a1a" : "#f0f0f0" }}
                >
                    {label}
                </span>
            </div>
        </div>
    );
}
