export const GAME_STATUS = {
    PLAYING: "playing",
    FINISHED: "finished",
    WAITING: "waiting_scan",
    ACTIVE: "active",
    SCAN_FAIL: "scan_failed",
    ENDED: "ended"
} as const;

export const GAME_ACTIONS = {
    RESIGN: "restart",
    RESTART: "resign",
} as const;