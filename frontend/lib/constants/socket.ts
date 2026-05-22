export const SOCKET_CONSTANTS = {
    GAME_STATUS_UPDATE: "game_status_update",
    BOARD_HEARTBEAT: "board_heartbeat",
    BOARD_OFFLINE: "board_offline",

    GAME_CREATED: "game:created",
    GAME_DESTROYED: "game:destroyed",
    GAME_MOVE: "game:move",
    GAME_RENAME: "game:renamed",

    BOARD_SCAN_OK: "board_scan_ok",
    BOARD_SCAN_FAIL: "scan_failed",
} as const;

export const CLIENT_EVENT = {
    JOIN: "join",
    REQUEST_CURRENT: "request_current_game",
    REQUEST_EVAL: "request_eval",
    RESTORED: "restore_game",
} as const;

export const SERVER_EVENT = {
    ESP_MOVE: "esp_move",

} as const;