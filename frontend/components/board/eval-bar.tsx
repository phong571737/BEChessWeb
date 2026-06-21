"use client"

interface Props {
    cp?: number | null;
    fen?: string;
    orientation?: "vertical" | "horizontal";
}

function getMaterial(fen: string): number {
    const vals: Record<string, number> = {
        p: 1, n: 3, b: 3, r: 5, q: 9,
        P: 1, N: 3, B: 3, R: 5, Q: 9
    };
    return [...fen.split(" ")[0]].reduce((s, c) => s + (vals[c] ?? 0), 0);
}

function cpToWinRate(cp: number, fen: string): number {
    if (cp >= 10000) return 1;
    if (cp <= -10000) return 0;
    const clamped = Math.max(-1000, Math.min(1000, cp));
    return 1 / (1 + Math.exp(-0.00368208 * clamped));

    // // The fitted model only uses data for material counts in [17, 78], and is anchored at count 58
    // const material = Math.max(17, Math.min(78, getMaterial(fen)));
    // const m = material / 58.0

    // // Return a = p_a(material) and b = p_b(material), see github.com/official-stockfish/WDL_mode
    // const as = [-72.32565836, 185.93832038, -144.58862193, 416.4495044];
    // const bs = [83.86794042, -136.06112997, 69.98820887, 47.6290143];
    
    // const a = (((as[0] * m + as[1]) * m + as[2]) * m) + as[3];
    // const b = (((bs[0] * m + bs[1]) * m + bs[2]) * m) + bs[3];

    // console.log("material:", material, "m:", m, "a:", a, "b:", b, "cp:", cp, "winRate:", 1 / (1 + Math.exp((a - cp) / b)));
    // return 1 / (1 + Math.exp((a - cp) / b));
}

export function EvalBar({ cp, fen = "", orientation = "vertical" }: Props) {
    const hasEval = cp != null && !isNaN(cp);
    const winRate = hasEval ? cpToWinRate(cp!, fen) : 0.5;

    const absEval = hasEval ? Math.abs(cp!) / 100 : 0;
    const label = hasEval
        ? (cp! >= 0 ? `+${absEval.toFixed(1)}` : `-${absEval.toFixed(1)}`)
        : "0.0";

    // Where the boundary sits (0 = all black, 1 = all white)
    const WhitePct = winRate * 100;
    const BlackPct = (1 - winRate) * 100;

    if (orientation == "horizontal") {
        const whiteAhead = hasEval && cp! > 0;
        return (
            <div className="flex items-center gap-1.5">
                {/* Bar */}
                <div className="relative flex-1 h-3 border border-border rounded-sm overflow-hidden flex">
                    {/* Black segment on left */}
                    <div
                        className="h-full bg-[#1a1a1a] transition-all duration-300"
                        style={{ width: `${BlackPct}%` }}
                    />
                </div>
            </div>
        )
    }

    // Vertical bar
    const boundaryPct = BlackPct; // from top
    const textInWhite = winRate >= 0.5;

    return (
        <div className="h-full flex flex-col items-center">
            <div className="eval-bar h-full relative" style={{ width: "25px" }}>
                {/* Black segment (top) */}
                <div className="eval-black-seg" style={{ height: `${BlackPct}%` }} />
                {/* White segment (bottom) */}
                <div className="eval-white-seg" style={{ height: `${WhitePct}%` }} />

                <div
                    className="absolute inset-x-0 flex justify-center items-center"
                    style={{
                        top: textInWhite ? `calc(${boundaryPct}% + 3px)` : `calc(${boundaryPct}% - 13px)`,
                    }}
                >
                    <span
                        className="font-mono leading-none select-none"
                        style={{
                            fontSize: "9px",
                            color: textInWhite ? "#1a1a1a" : "#f0f0f0",
                            letterSpacing: "-0.02em",
                        }}
                    >
                        {label}
                    </span>
                </div>
            </div>
        </div>
    );
}