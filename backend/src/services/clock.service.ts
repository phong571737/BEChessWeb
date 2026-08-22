import { GameDoc } from "../types/game.types.js";

export type ClockSide = "white" | "black";

/** Calculate a read-only clock snapshot from persisted server state. */
export function getCurrentClock(game: GameDoc, now = Date.now()) {
    const configuredInitial = Number(game.initialTimeMs ?? 3_600_000);
    const initial = Number.isFinite(configuredInitial) && configuredInitial >= 0
        ? configuredInitial
        : 3_600_000;
    const storedWhite = Number(game.whiteRemainingMs ?? game.whiteRemainingTimeMs ?? initial);
    const storedBlack = Number(game.blackRemainingMs ?? game.blackRemainingTimeMs ?? initial);
    let white = Number.isFinite(storedWhite) && storedWhite >= 0 ? storedWhite : initial;
    let black = Number.isFinite(storedBlack) && storedBlack >= 0 ? storedBlack : initial;
    const activeClockSide: ClockSide = game.activeClockSide ?? "white";

    const clockStart = game.clockStartedAt ? new Date(game.clockStartedAt).getTime() : NaN;
    if (Number.isFinite(clockStart) && ["playing", "active"].includes(game.status ?? "")) {
        const elapsed = Math.max(0, now - clockStart);
        if (activeClockSide === "white") white = Math.max(0, white - elapsed);
        else black = Math.max(0, black - elapsed);
    }

    return {
        whiteRemainingMs: Math.max(0, Math.round(white)),
        blackRemainingMs: Math.max(0, Math.round(black)),
        activeClockSide,
        clockStartedAt: game.clockStartedAt ? new Date(game.clockStartedAt).toISOString() : null,
        serverNow: now,
    };
}
