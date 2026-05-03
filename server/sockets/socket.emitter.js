import { getIO } from "./index.js";

// Notify to browser when board create sucessfully
export function emitBoardConnected(gameID) {
    if (!getIO()) return;
    getIO().to(gameID).emit('board_connected', {gameID});
    console.log(`Board connected: ${gameID}`);
}

// Notify to browser to check state of board
export function emitInitCheck(game, result) {
    if (!getIO()) return;
    const gameID = game._id ?? game.gameID;
    getIO().to(gameID).emit('initcheck', {gameID, ...result});
    console.log(`Init check emitted: ${result.status}`);
}