export type TimeControlType = "blitz" | "rapid" | "classical";

export const DEFAULT_INITIAL_TIME_MS = 60 * 60 * 1_000;
export const DEFAULT_INCREMENT_MS = 15 * 1_000;

/** Classifies a time control using FIDE's 60-move equivalent duration. */
export function classifyTimeControl(initialTimeMs?: number, incrementMs = 0): TimeControlType {
    const initial = Math.max(0, Number(initialTimeMs ?? DEFAULT_INITIAL_TIME_MS));
    const increment = Math.max(0, Number(incrementMs) || 0);
    const fideDurationMs = initial + 60 * increment;
    if (fideDurationMs <= 10 * 60_000) return "blitz";
    if (fideDurationMs < 60 * 60_000) return "rapid";
    return "classical";
}

/** Recomputes current records while retaining legacy labels with no clock metadata. */
export function resolveTimeControlType(
    initialTimeMs?: number | null,
    incrementMs?: number | null,
    storedType?: TimeControlType,
): TimeControlType {
    const hasInitialTime = initialTimeMs !== undefined
        && initialTimeMs !== null
        && Number.isFinite(Number(initialTimeMs));
    return hasInitialTime
        ? classifyTimeControl(initialTimeMs, incrementMs ?? 0)
        : storedType ?? classifyTimeControl(initialTimeMs ?? undefined, incrementMs ?? 0);
}
