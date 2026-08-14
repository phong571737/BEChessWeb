export type TimeControlType = "blitz" | "rapid" | "classical";

/** Tournament default: 60 minutes per side with a 15-second increment. */
export const DEFAULT_INITIAL_TIME_MS = 60 * 60 * 1_000;
export const DEFAULT_INCREMENT_MS = 15 * 1_000;

export function classifyTimeControl(initialTimeMs?: number): TimeControlType {
    const minutes = Math.max(0, Number(initialTimeMs ?? DEFAULT_INITIAL_TIME_MS)) / 60_000;
    if (minutes <= 10) return "blitz";
    if (minutes < 60) return "rapid";
    return "classical";
}
