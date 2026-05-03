export interface LastMove {
  from: string;
  to: string;
  uci: string;
}

/** Physical chess board registered via heartbeat */
export interface PhysicalBoard {
  boardID: string;
  gameID: string | null;
  /** Status of the game linked to this board (null when no game) */
  gameStatus: "waiting_scan" | "scan_failed" | "active" | "finished" | null;
  online: boolean;
  lastSeen: number;
  ip?: string | null;
}

/** Active game returned by GET /games/current */
export interface ActiveGame {
  gameID: string;
  WhiteName: string;
  BlackName: string;
  fen: string;
  pgn: string;
  lastMove?: LastMove | null;
  lastSeq: number;
  createdAt: string;
  status?: string | null;
}

/** Completed game returned by GET /games/history */
export interface HistoryGame {
  _id: string;
  White: string;
  Black: string;
  Result: "1-0" | "0-1" | "1/2-1/2" | "*";
  Date: string;
  totalMoves: number;
  pgn: string;
  createAt?: string;
  endedAt?: string;
  durationSec?: number | null;
}

/** Per-game live state stored in Zustand */
export interface BoardState {
  fen: string;
  pgn: string;
  cp: number | null;
  whiteName: string;
  blackName: string;
  lastMove: { from: string; to: string } | null;
  boardConnected: boolean;
  /** Game lifecycle status */
  status: "playing" | "ended" | "waiting" | "waiting_scan" | "scan_failed";
  result?: string;
  /** Squares with missing pieces (populated when status === "scan_failed") */
  scanMissing: string[];
  /** Reason for scan failure: "MISSING" | "DUPLICATE" | null */
  scanReason: "MISSING" | "DUPLICATE" | null;
}
