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
  /** Physical button state (true = pressed, reported in heartbeat) */
  btn?: boolean;
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
  gameID?: string;
  WhiteName: string;
  BlackName: string;
  Result: "1-0" | "0-1" | "1/2-1/2" | "*";
  Date: string;
  totalMoves: number;
  totalPlies?: number;
  pgn: string;
  fenStart?: string;
  fenEnd?: string;
  fenHistory?: string[];
  createAt?: string;
  createdAt?: string;
  endedAt?: string;
  durationSec?: number | null;
  source?: "pgn" | "fen";
}

/** Per-game live state stored in Zustand */
export interface BoardState {
  fen: string;
  pgn: string;
  /** Raw FEN history from server (fallback when PGN can't be built) */
  fenHistory: string[] | null;
  cp: number | null;
  whiteName: string;
  blackName: string;
  lastMove: { from: string; to: string } | null;
  boardConnected: boolean;
  /** Latest applied move sequence from realtime stream */
  lastSeq: number;
  /** Game lifecycle status */
  status: "playing" | "ended" | "waiting" | "waiting_scan" | "scan_failed";
  result?: string;
  /** Squares with missing pieces (populated when status === "scan_failed") */
  scanMissing: string[];
  /** Reason for scan failure: "MISSING" | "DUPLICATE" | null */
  scanReason: "MISSING" | "DUPLICATE" | null;
}
