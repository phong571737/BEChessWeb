export type TimeControlType = "blitz" | "rapid" | "classical";

export const DEFAULT_INITIAL_TIME_MS = 60 * 60 * 1_000;
export const DEFAULT_INCREMENT_MS = 15 * 1_000;

/** Classifies a game by the initial time available to each side. */
export function classifyTimeControl(initialTimeMs?: number, _incrementMs = 0): TimeControlType {
    const minutes = Math.max(0, Number(initialTimeMs ?? DEFAULT_INITIAL_TIME_MS)) / 60_000;
    if (minutes <= 10) return "blitz";
    if (minutes < 60) return "rapid";
    return "classical";
}
