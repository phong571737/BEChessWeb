export interface CreateBoardBody {
  boardID: string;
}
 
export interface InitCheckParams {
  id: string;
}
 
export interface InitCheckBody {
  boardType: string;
  board: unknown;
  buttonState?: boolean;
}
 
export interface BoardCheckResult {
  status: string;
  missingSquares?: string[];
  extraSquares?: string[];
  wrongPieceSquares?: string[];
}