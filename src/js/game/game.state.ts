import { getIO } from "../sockets/index.js";

export type BoardStatus = "offline" | "online";
export type GameStatus = "idle" | "playing" | "finished" | "restart" | "checkinit" | "ready";

export interface GameStateData {
    boardStatus: BoardStatus;
    gameStatus: GameStatus;
    wrongSquares: string[];
    missingSquares: string[];
    [key: string]: unknown;
}

export type GameStatePatch = Partial<GameStateData>;

export const gameState = {
    data: {} as Record<string, GameStateData>,

    saveState(gameID: string): GameStateData {
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
    set(gameID: string, patch: GameStatePatch): void {
        const current = this.saveState(gameID);
        this.data[gameID] = {
            ...current,
            ...patch,

            wrongSquares: patch.wrongSquares ?? current.wrongSquares,
            missingSquares: patch.missingSquares ?? current.missingSquares,
        };
    },

    get(gameID: string) {
        return this.data[gameID];
    },

    delete(gameID: string): void {
        delete this.data[gameID];
    }
}

export function emitGameState(gameID: string): void {
    const state = gameState.get(gameID);
    if (!state) return;

    getIO().emit("game_state", {
        gameID,
        ...state,
    });
}