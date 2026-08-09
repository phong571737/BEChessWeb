import { Color, PieceSymbol, Square } from "chess.js";
import { MOVE_STATUS } from "../constant.js";
import { SerializedBranch } from "./move.types.js";

export interface MoveLike {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export interface ValidMove extends MoveLike{
    uci: string;
    color: Color;
    piece?: PieceSymbol;
    captured?: PieceSymbol;
    flags: string;
    san: string;
    lan: string;
    before: string;
    after: string
}

export interface CreateGameResult {
  boardID: string;
  gameID: string;
  fen: string;
  round: number;
}
 
export interface Branch {
  id: string;
  move: MoveLike;
  fen: string;
  pgn: string;
  lastApplied: MoveLike;
  step: number;
  parentId: string | null;
}

export interface BranchResponse {
    status: (typeof MOVE_STATUS)[keyof typeof MOVE_STATUS];
    gameID: string;
    fen: string;
    pgn: string;
    lastSeq: number;
    branches: SerializedBranch[];
    branchCount: number;
    invalidMove?: boolean;
}