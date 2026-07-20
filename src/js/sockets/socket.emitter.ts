import { BoardCheckResult } from "../types/board.types.js";
import { getIO } from "./index.js";

// Notify to browser when board create sucessfully
export function emitBoardConnected(gameID: string): void {
    if (!getIO()) return;
    getIO().to(gameID).emit('board_connected', {gameID});
    console.log(`Board connected: ${gameID}`);
}

// Notify to browser to check state of board
export function emitInitCheck(gameID: string, result: BoardCheckResult): void {
    if (!getIO()) return;
    getIO().to(gameID).emit('initcheck', {gameID, ...result});
    console.log(`Init check emitted: ${result.status}`);
}