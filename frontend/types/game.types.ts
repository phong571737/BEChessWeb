import { GAME_STATUS } from "@/lib/constants/game";

export interface lastMove {
    from: string;
    to: string;
    uci: string;
}

/** Physical chess board registered via heartbeat */
export interface PhysicalBoard {
    boardID: string;
    gameID: string | null;
    gameStatus: "waiting" | "checkinit" | "waiting_scan" | "scan_failed" | "active" | "finished" | null;
    online: boolean;
    ip?: string | null;
}

/** Active game returned by GET /games/current */
export interface ActiveGame {
    gameID: string;
    WhiteName: string;
    BlackName: string;
    fen: string;
    pgn: string;
    initialFen?: string;
    lastMove?: lastMove | null;
    lastSeq: number;
    createdAt: string;
    status?: string | null;
}

/** Completed game returned by GET /games/history */
export interface HistoryGame {
    _id: string;
    WhiteName: string;
    BlackName: string;
    Result: "1-0" | "0-1" | "1/2-1/2" | "*";
    Date: string;
    totalMoves: number;
    totalPlies?: number;
    pgn: string;
    initialFen?: string;
    createdAt?: string;
    endedAt?: string;
    durationSec?: number | null;
    fenHistory?: string [];
    uciHistory?: string [];
}

/** Per-game live state stored in Zustand */
export interface BoardState {
    fen: string,
    pgn: string,
    cp: number | null,
    WhiteName: string,
    BlackName: string,
    lastMove: {from: string, to: string} | null;
    boardConnected: boolean;
    /** Game lifecycle status */
    status: "playing" | "ended" | "waiting" | "waiting_scan" | "scan_failed";
    result?: string;
    /** Squares with missing pieces (populated when status === "scan_failed") */
    scanMissing: string[]; 
    /** Reason for scan failure: "MISSING" | "DUPLICATE" | null */
    scanReason: "MISSING" | "DUPLICATE" | null;

    // Check init state
    initStatus: "waiting" | "ready" | "check_init" | "waiting_button" | "wrong_piece" | "missing_piece";
    buttonReady?: boolean;
    missingSquares: string[];
    extraSquares: string[];
    wrongPieceSquares: string[];

    // Branches
    branches: Branch[];
    selectedBranchId: string | null;

    errorSquares: string[];
    /** Changes on an in-place restart so local UI state, including clocks, can reset. */
    resetRevision?: number;

    /** Chess clock configuration in milliseconds. */
    initialTimeMs?: number;
    incrementMs?: number;
    /** Legacy second-based fields returned by older games. */
    clockSeconds?: number;
    clockIncrement?: number;
}

export interface BranchMove {
    from: string;
    to: string;
    promotion?: string | null;
    san?: string;
    uci?: string;
}

export interface Branch {
    id: string;
    fen: string;
    pgn: string;
    lastMove: BranchMove | null;
    step: number;
    parentId: string | null;
}
