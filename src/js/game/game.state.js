import { getIO } from "../sockets/index.js";

export const gameState = {
    data: {},

    saveState(gameID) {
        if (!this.data[gameID]) {
            this.data[gameID] = {
                boardStatus: "offline",
                gameStatus: "idle",
                wrongSquares: [],
                missingSquares: [],
            };
        }
        return this.data[gameID];
    },

    // set data 
    set(gameID, patch) {
        const current = this.saveState(gameID);
        this.data[gameID] = {
            ...current,
            ...patch,

            wrongSquares: patch.wrongSquares ?? current.wrongSquares,
            missingSquares: patch.missingSquares ?? current.missingSquares,
        };
    },

    get(gameID) {
        return this.data[gameID];
    }
}

export function emitGameState(gameID) {
    const state = gameState.get(gameID);
    if (!state) return;

    getIO().emit("game_state", {
        gameID,
        ...state,
    });
}