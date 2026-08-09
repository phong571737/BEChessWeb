export interface CreateBoardBody {
  boardID: string;
}

export interface InitCheckBody {
  boardType: string;
  board: NFCBoard | number[];
  buttonState?: boolean;
}

export interface WrongPieceInfo {
  square: string;
  expected: string;
  actual: string;
}

export type NFCBoard = Record<string, string>;

// Fields common to both NFC and HALL board checks.
interface BaseBoardCheckResult {
  status: string;
  missingSquares: string[];
}

export interface NFCCheckResult extends BaseBoardCheckResult{
  extraSquares: string[];
  wrongPieceSquares: WrongPieceInfo[];
}

export interface HallCheckResult extends BaseBoardCheckResult{
  wrongSquares: string[];
}

export type BoardCheckResult = NFCCheckResult | HallCheckResult;
