export interface ClientToServerEvents {
  "join": { gameID: string };
  "request_current_game": { gameID: string };
  "esp_move": { gameID: string; uci: string };
  "request_eval": { gameID: string; fen: string };
  "resign": { gameID: string; resignSide: "white" | "black" };
  "restart": { gameID: string };
}

export interface ServerToClientEvents {
  "board_connected": { gameID: string };
  "restore_game": { gameID: string; fen: string; pgn?: string; lastMove?: MoveData | null; WhiteName?: string; BlackName?: string };
  "esp_move": { gameID: string; lastMove: MoveData; fen: string; pgn?: string };
  "eval_update": { gameID: string; cp: number };
  "eval_realtime": { gameID: string; cp: number };
  "eval_bestmove": { gameID: string; bestMove: string };
  "game:renamed": { gameID: string; WhiteName: string; BlackName: string };
  "update_all_game": { gameID: string };
  "initcheck": { gameID: string; status: string };
  /** Board heartbeat — online: true when active, false/absent when offline */
  "board_heartbeat": { boardID: string; gameID: string | null; online: boolean };
  /** Board went offline (TTL or graceful disconnect) */
  "board_offline": { boardID: string; gameID: string | null };
  /** ESP32 completed initial board scan successfully */
  "board_scan_ok": { gameID: string; boardID: string };
  /** ESP32 scan failed (missing/duplicate pieces) */
  "board_scan_failed": { gameID: string; boardID: string; reason: "MISSING" | "DUPLICATE"; missing: string[] };
  /** Game status changed on the server */
  "game_status_update": { gameID: string; status: "waiting_scan" | "scan_failed" | "active" };
  /** In-game error from ESP32 (WRONG_TURN, PIECE_LOST, ILLEGAL_DEST, etc.) */
  "board_alert": { gameID: string; boardID: string; code: string; detail: string };
  /** New game was created */
  "game:created": { gameID: string };
}

export type SocketEvents = ClientToServerEvents & ServerToClientEvents;

export interface MoveData {
  from: string;
  to: string;
  promotion?: string;
  uci?: string;
}

export interface BoardState {
  fen: string;
  pgn: string;
  cp: number | null;
  whiteName: string;
  blackName: string;
  lastMove: MoveData | null;
  boardConnected: boolean;
  status: "waiting" | "playing" | "ended" | "waiting_scan" | "scan_failed";
}

export interface GameHistory {
  _id: string;
  pgn: string;
  Result: string;
  White: string;
  Black: string;
  Date: string;
  totalMoves: number;
  createAt: Date;
}
