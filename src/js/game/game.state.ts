import { getIO } from "../sockets/index.js";

export type BoardStatus = "offline" | "online";
export type GameStatus = "idle" | "playing" | "finished" | "restart" | "checkinit" | "ready";

export interface GameStateData {
    boardStatus: BoardStatus;
    gameStatus: GameStatus;
    wrongSquares: string[];
    missingSquares: string[];
    initResultStatus?: string;
    buttonReady?: boolean;
    [key: string]: unknown;
}

export type GameStatePatch = Partial<GameStateData>;

const OFFLINE_STATE_TTL_MS = 10 * 60 * 1_000;
const lastUpdatedAt = new Map<string, number>();

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
            lastUpdatedAt.set(gameID, Date.now());
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
        lastUpdatedAt.set(gameID, Date.now());
    },

    get(gameID: string) {
        return this.data[gameID];
    },

    delete(gameID: string): void {
        delete this.data[gameID];
        lastUpdatedAt.delete(gameID);
    }
}

function pruneStaleOfflineStates(now = Date.now()): void {
    for (const [boardID, updatedAt] of lastUpdatedAt) {
        if (gameState.data[boardID]?.boardStatus === "offline" && now - updatedAt >= OFFLINE_STATE_TTL_MS) {
            gameState.delete(boardID);
        }
    }
}

const cleanupTimer = setInterval(() => pruneStaleOfflineStates(), 60_000);
cleanupTimer.unref();

export function emitGameState(gameID: string): void {
    const state = gameState.get(gameID);
    if (!state) return;

    getIO().emit("game_state", {
        gameID,
        ...state,
    });
}
