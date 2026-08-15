export type TimeControlType = "blitz" | "rapid" | "classical";

/** Tournament default: 60 minutes per side with a 15-second increment. */
export const DEFAULT_INITIAL_TIME_MS = 60 * 60 * 1_000;
export const DEFAULT_INCREMENT_MS = 15 * 1_000;

/** Base clock choices shared by the start-game and live-game settings dialogs. */
export const INITIAL_TIME_OPTIONS_MS = [
    60_000,
    180_000,
    300_000,
    600_000,
    900_000,
    1_800_000,
    2_700_000,
    3_600_000,
] as const;

export function classifyTimeControl(initialTimeMs?: number): TimeControlType {
    const minutes = Math.max(0, Number(initialTimeMs ?? DEFAULT_INITIAL_TIME_MS)) / 60_000;
    if (minutes <= 10) return "blitz";
    if (minutes < 60) return "rapid";
    return "classical";
}
