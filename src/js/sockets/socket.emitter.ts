import { BoardCheckResult } from "../types/board.types.js";
import { getIO } from "./index.js";

// Notify to browser when board create sucessfully
export function emitBoardConnected(gameID: string): void {
    try {
        getIO().to(gameID).emit('board_connected', {gameID});
        console.log(`Board connected: ${gameID}`);
    } catch (e) {
        // socket not initialized yet
    }
}

// Notify to browser to check state of board
export function emitInitCheck(gameID: string, result: BoardCheckResult): void {
    try {
        getIO().to(gameID).emit('initcheck', {gameID, ...result});
        console.log(`Init check emitted: ${result.status}`);
    } catch (e) {
        // socket not initialized yet
    }
}