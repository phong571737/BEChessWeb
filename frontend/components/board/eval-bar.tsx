"use client"

interface Props {
    /** Centipawns from White's perspective. Ignored when `mate` is set. */
    cp?: number | null;
    /** Mate in N from White's perspective (+ = White mates, − = Black mates). */
    mate?: number | null;
    orientation?: "vertical" | "horizontal";
}

/** Lichess winning-chances → [0, 1] share for White (see lichess-org/lila). */
function whiteWinShare(cp: number | null | undefined, mate: number | null | undefined): number {
    if (mate != null && mate !== 0) {
        const signedCp = (21 - Math.min(10, Math.abs(mate))) * 100 * Math.sign(mate);
        return (rawWinningChances(signedCp) + 1) / 2;
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

export function EvalBar({ cp = null, mate = null, orientation = "vertical" }: Props) {
    const hasEval = mate != null || (cp != null && !Number.isNaN(cp));
    const whitePct = whiteWinShare(cp, mate) * 100;
    const blackPct = 100 - whitePct;
    const label = formatEval(cp, mate);
    const whiteAhead = hasEval ? (mate != null ? mate > 0 : (cp ?? 0) >= 0) : true;

    if (orientation === "horizontal") {
        return (
            <div className="eval-bar eval-bar--horizontal relative w-full h-5 overflow-hidden border border-border">
                <div
                    className="absolute inset-y-0 left-0 bg-[#403d39] transition-[width] duration-500 ease-out"
                    style={{ width: `${blackPct}%` }}
                />
                <div
                    className="absolute inset-y-0 right-0 bg-[#f0f0f0] transition-[width] duration-500 ease-out"
                    style={{ width: `${whitePct}%` }}
                />
                <div
                    className="absolute inset-y-0 flex items-center px-1.5 pointer-events-none"
                    style={{
                        left: whiteAhead ? "auto" : 0,
                        right: whiteAhead ? 0 : "auto",
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

    // Vertical — black on top, white on bottom (Lichess / Chess.com)
    return (
        <div className="eval-bar eval-bar--vertical relative h-full w-full overflow-hidden border border-border bg-[#f0f0f0]">
            <div
                className="absolute inset-x-0 top-0 bg-[#403d39] transition-[height] duration-500 ease-out"
                style={{ height: `${blackPct}%` }}
            />
            {/* Midline tick (equal position) */}
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-px bg-black/25 pointer-events-none" />

            <div
                className="absolute inset-x-0 flex justify-center pointer-events-none"
                style={{
                    top: whiteAhead ? "auto" : 4,
                    bottom: whiteAhead ? 4 : "auto",
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
