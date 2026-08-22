import { Document } from "mongodb";

export type ResignSide = "white" | "black" | "draw";

export interface GameBranch {
    id: string;
    pgn?: string;
    fen?: string;
    /** Position at game creation; used to rebuild custom PGN without legal-move validation. */
    initialFen?: string;
}

// Common interface for both active, state and history games
export interface GameSetupMetadata {
    /** Chess clock: initial time per side in milliseconds. */
    initialTimeMs?: number;
    /** Chess clock increment per move in milliseconds. */
    incrementMs?: number;
    round?: number;
    location?: string;
    boardNumber?: string;
}

export interface GameDoc extends Document, GameSetupMetadata {
    gameID: string;
    boardID?: string;
    BlackName?: string;
    WhiteName?: string;
    /** Canonical names for new records; legacy capitalized fields remain readable. */
    whiteName?: string;
    blackName?: string;
    /** Current remaining time per side, persisted in milliseconds. */
    whiteRemainingMs?: number;
    blackRemainingMs?: number;
    /** Legacy name accepted while older documents are migrated. */
    whiteRemainingTimeMs?: number;
    blackRemainingTimeMs?: number;
    activeClockSide?: "white" | "black";
    clockStartedAt?: Date | null;
    clockVersion?: number;
    fen?: string;
    currentFen?: string;
    pgn?: string;
    lastMove?: unknown;
    lastSeq?: number;
    status?: string;
    /** Optimistic-concurrency revision; incremented by every guarded game transition. */
    version?: number;
    /** Temporary atomic state used while a resignation is being finalized. */
    resigningAt?: Date | null;
    result?: string;
    branches?: GameBranch[];
    uciHistory?: string[];
    fenHistory?: string[];
    /** Raw FEN snapshots received from the electronic board. Never overwrite these with recovery output. */
    fenHistoryEdited?: string[];
    /** PGN generated from the standard recovered timeline. */
    /** Preferred PGN line generated from recover-service. */
    /** Initial position normalized by recover-service, when available. */
    /** Recovery state for the standard FEN timeline. */
    /** Elapsed thinking time for each accepted ply, aligned with UCI/FEN history. */
    moveDurationsMs?: number[];
    updateAt?: Date;
    createdAt?: Date;
    /** Set when the first accepted move is saved; reset clears this timestamp. */
    startedAt?: Date | null;
    /** Updated for each accepted move so active and completed game duration can be calculated. */
    lastMoveAt?: Date | null;
    durationSec?: number;
    /** Legacy chess clock fields in seconds, retained for old documents only. */
    clockSeconds?: number;
    clockIncrement?: number;
    timeControlType?: "blitz" | "rapid" | "classical";
    [key: string]: unknown;
}

export interface SaveGameOptions {
    uci?: string;
    fen?: string;
    seq?: number;
    boardType?: string;
    /** Elapsed thinking time for the accepted move being appended. */
    moveDurationMs?: number;
    /** Only update when the persisted game still has this revision. */
    expectedVersion?: number;
    /** Optional persisted status precondition for a state transition. */
    expectedStatus?: string | string[];
}

export interface GameIdParams extends Record<string, string> {
    id: string;
}

export interface PostPgnBody {
    pgn: string;
    fen: string;
    lastMove: unknown;
}

export interface GameIDPayload {
    gameID: string;
}

export interface ResignPayload extends GameIDPayload {
    resignSide: ResignSide;
}

export interface EndGameBody {
    pgn: string;
}

export interface UpdateGameBody {
    date?: string;
    result?: string;
    pgn: string;
}

export interface RemoveGameByBoardResult {
    deleted: string;
    deletedCount: number;
    gameIDs: string[];
}

export interface ResignBody {
    resignSide: ResignSide;
    boardType: string;
    branchId?: string | null;
}

// RenameBody is used to rename information about a game
export interface RenameBody extends GameSetupMetadata {
    color: string;
    name: string;
}
