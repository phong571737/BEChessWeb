"use client";

interface Props {
  cp?:          number | null;
  orientation?: "vertical" | "horizontal";
}

function cpToWinRate(cp: number): number {
  // Sigmoid — clamp to ±600 cp to avoid extreme values
  const clamped = Math.max(-600, Math.min(600, cp));
  return 1 / (1 + Math.exp(-clamped / 400));
}

export function EvalBar({ cp, orientation = "vertical" }: Props) {
  const hasEval  = cp != null && !isNaN(cp);
  const winRate  = hasEval ? cpToWinRate(cp!) : 0.5;

  const absVal   = hasEval ? Math.abs(cp!) / 100 : 0;
  const label    = hasEval
    ? (cp! >= 0 ? `+${absVal.toFixed(1)}` : `-${absVal.toFixed(1)}`)
    : "0.0";

  // Where the boundary sits (0 = all black, 1 = all white)
  const whitePct = winRate * 100;
  const blackPct = (1 - winRate) * 100;

  if (orientation === "horizontal") {
    // Which side is ahead — used for the label colour
    const whiteAhead = hasEval && cp! > 0;
    return (
      <div className="flex items-center gap-1.5">
        {/* Bar */}
        <div className="relative flex-1 h-3 border border-border rounded-sm overflow-hidden flex">
          {/* Black segment on left */}
          <div
            className="h-full bg-[#1a1a1a] transition-all duration-300"
            style={{ width: `${blackPct}%` }}
          />
          {/* White segment on right */}
          <div
            className="h-full bg-[#f0f0f0] transition-all duration-300"
            style={{ width: `${whitePct}%` }}
          />
          {/* Centre tick — subtle reference line at 50 % */}
          <div className="absolute inset-y-0 left-1/2 w-px bg-border/60 pointer-events-none" />
        </div>
        {/* Score label — coloured by who's ahead */}
        <span
          className="text-[10px] font-mono w-8 text-right shrink-0 tabular-nums font-medium"
          style={{ color: whiteAhead ? "hsl(var(--state-success))" : !hasEval ? undefined : "hsl(var(--muted-foreground))" }}
        >
          {label}
        </span>
      </div>
    );
  }

  // Vertical bar — score text overlaid inside the bar at the boundary
  const boundaryPct = blackPct; // from top
  const textInWhite = winRate >= 0.5;

  return (
    <div className="h-full flex flex-col items-center">
      <div className="eval-bar h-full relative" style={{ width: "20px" }}>
        {/* Black segment — from top */}
        <div className="eval-black-seg" style={{ height: `${blackPct}%` }} />
        {/* White segment — from bottom */}
        <div className="eval-white-seg" style={{ height: `${whitePct}%` }} />

        {/* Score label — overlaid at the boundary, inside the dominant segment */}
        <div
          className="absolute inset-x-0 flex justify-center items-center pointer-events-none transition-all duration-300 z-10"
          style={{
            top: textInWhite
              ? `calc(${boundaryPct}% + 3px)`
              : `calc(${boundaryPct}% - 13px)`,
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
