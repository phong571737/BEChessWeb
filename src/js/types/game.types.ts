import { Document } from "mongodb";

export type ResignSide = "white" | "black" | "draw";

export interface GameBranch {
    id: string;
    pgn?: string;
    fen?: string;
}

export interface GameDoc extends Document {
    gameID: string;
    boardID?: string;
    BlackName?: string;
    WhiteName?: string;
    fen?: string;
    pgn?: string;
    lastMove?: unknown;
    lastSeq?: number;
    round?: number;
    status?: string;
    result?: string;
    totalMoves?: number;
    branches?: GameBranch[];
    uciHistory?: string[];
    fenHistory?: string[];
    updateAt?: Date;
    createdAt?: Date;
    /** Chess clock: initial time per side in seconds */
    clockSeconds?: number;
    /** Chess clock: increment per move in seconds */
    clockIncrement?: number;
    [key: string]: unknown;
}

export interface SaveGameOptions {
    uci?: string;
    fen?: string;
    seq?: number;
    boardType?: string;
}

export interface GameIdParams {
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

export interface RenameBody {
    color: string;
    name: string;
    clockSeconds?: number;
    clockIncrement?: number;
}
