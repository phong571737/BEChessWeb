import { BoardCheckResult } from "../types/board.types.js";
import { emitWithSpectatorDelay } from "../services/spectator-delay.service.js";

// Notify to browser when board create sucessfully
export function emitBoardConnected(gameID: string): void {
    try {
        void emitWithSpectatorDelay('board_connected', {gameID}, { scope: "game", gameID });
        console.log(`Board connected: ${gameID}`);
    } catch (e) {
        // socket not initialized yet
    }
}

// Notify to browser to check state of board
export function emitInitCheck(gameID: string, result: BoardCheckResult): void {
    try {
        void emitWithSpectatorDelay('initcheck', {gameID, ...result}, { scope: "game", gameID });
        console.log(`Init check emitted: ${result.status}`);
    } catch (e) {
        // socket not initialized yet
    }
}
