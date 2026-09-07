import { DEFAULT_INCREMENT_MS, DEFAULT_INITIAL_TIME_MS } from "./time-control";

const STORAGE_KEY = "chess:last-time-control";

export interface LastTimeControl {
    initialTimeMs: number;
    incrementMs: number;
}

export function getLastTimeControl(): LastTimeControl {
    if (typeof window === "undefined") {
        return { initialTimeMs: DEFAULT_INITIAL_TIME_MS, incrementMs: DEFAULT_INCREMENT_MS };
    }
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<LastTimeControl> | null;
        if (Number.isFinite(parsed?.initialTimeMs) && Number(parsed.initialTimeMs) > 0
            && Number.isFinite(parsed?.incrementMs) && Number(parsed.incrementMs) >= 0) {
            return { initialTimeMs: Number(parsed.initialTimeMs), incrementMs: Number(parsed.incrementMs) };
        }
    } catch {
        // Ignore malformed browser-only preferences and use application defaults.
    }
    return { initialTimeMs: DEFAULT_INITIAL_TIME_MS, incrementMs: DEFAULT_INCREMENT_MS };
}

export function saveLastTimeControl(timeControl: LastTimeControl): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(timeControl));
}
