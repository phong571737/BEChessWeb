export interface ParseCandidatesInput {
    boardType: string;
    uci?: string;
    moveType: string;
    departures?: string;
    arrivals?: string;
}

export interface ProcessMoveInput extends ParseCandidatesInput{
    fen?: string;
    boardID: string;
    seq: number;
}

export interface ParsedCandidatesSuccess {
    candidates: string[];
    isError?: boolean;
    error?: undefined;
}

export interface ParsedCandidatesError {
    error: true;
    message: string;
    candidates?: undefined;
}

export type ParsedCandidates = | ParsedCandidatesSuccess | ParsedCandidatesError;

export interface SerializedBranch {
    uci: string;
    from: string;
    to: string;
}

export interface MoveState {
    gameID?: string;
    status: string;
    fen?: string;
    pgn?: string;
    lastSeq?: number;
    lastMove?: unknown;
    branchCount?: number;
    branches?: SerializedBranch[];
    invalidMove?: boolean;
    error?: boolean;
    isError?: boolean;
    message?: string;
}

export interface UCIMove {
    from: string;
    to: string;
    promotion?: string;
}