export type TimeControlType = "blitz" | "rapid" | "classical";

/** Classifies a game by the initial time available to each side. */
export function classifyTimeControl(initialTimeMs?: number, _incrementMs = 0): TimeControlType {
    const minutes = Math.max(0, Number(initialTimeMs ?? 600_000)) / 60_000;
    if (minutes <= 10) return "blitz";
    if (minutes < 60) return "rapid";
    return "classical";
}
