export type TimeControlType = "blitz" | "rapid" | "classical";

export function classifyTimeControl(initialTimeMs?: number): TimeControlType {
    const minutes = Math.max(0, Number(initialTimeMs ?? 600_000)) / 60_000;
    if (minutes <= 10) return "blitz";
    if (minutes < 60) return "rapid";
    return "classical";
}
