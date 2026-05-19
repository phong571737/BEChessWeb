export const SOCKET_CONSTANTS = {
    GAME_STATUS_UPDATE: "game_status_update",
    BOARD_HEARTBEAT: "board_heartbeat",
    BOARD_OFFLINE: "board_offline",

    GAME_CREATED: "game:created",
    GAME_DESTROYED: "game:destroyed",
    GAME_MOVE: "game:move",

    BOARD_SCAN_OK: "board_scan_ok",
    BOARD_SCAN_FAIL: "scan_failed",
} as const;