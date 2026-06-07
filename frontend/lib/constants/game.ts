export const GAME_STATUS = {
    PLAYING: "playing",
    FINISHED: "finished",
    WAITING_SCAN: "waiting_scan",
    ACTIVE: "active",
    SCAN_FAIL: "scan_failed",
    ENDED: "ended",
    WAITING: "waiting",
    READY: "ready",
    CHECK_INIT: "check_init",
} as const;

export const GAME_ACTIONS = {
    RESIGN: "restart",
    RESTART: "resign",
} as const;