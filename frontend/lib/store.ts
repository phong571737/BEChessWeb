import type { ActiveGame, BoardState, PhysicalBoard } from "@/types/game.types";
import { create } from "zustand";
import { GAME_STATUS } from "./constants/game";

interface GameStoreState {
    /** Active games shown on home page */
    activeGames: ActiveGame[];
    setActiveGames: (games: ActiveGame[]) => void;
    patchActiveGame: (gameID: string, patch: Partial<ActiveGame>) => void;
    removeActiveGame: (gameID: string) => void;
    upsertActiveGame: (game: ActiveGame, boardID?: string) => void;

    /** Physical boards detected via heartbeat */
    physicalBoards: PhysicalBoard[];
    patchPhysicalBoard: (board: Pick<PhysicalBoard, "boardID"> & Partial<Omit<PhysicalBoard, "boardID">>) => void;
    patchPhysicalBoardGameStatus: (gameID: string, gameStatus: PhysicalBoard["gameStatus"]) => void;
    removePhysicalBoard: (boardID: string) => void;

    /** Clear a stale gameID link — called when the board page gets a 404 for this game */
    clearPhysicalBoardGameID: (gameID: string) => void;

    /** Per-game board state (board page) */
    boards: Record<string, BoardState>;
    patchBoard: (gameID: string, patch: Partial<BoardState>) => void;
    getBoard: (gameID: string) => BoardState | undefined;
}

const defaultBoard = (): BoardState => ({
    fen: "start",
    fenHistory: [],
    pgn: "",
    cp: null,
    whiteName: "White",
    blackName: "Black",
    lastMove: null,
    boardConnected: false,
    status: "waiting",

    scanMissing: [],
    scanReason: null,

    // Check initial state 
    initStatus: GAME_STATUS.WAITING,
    missingSquares: [],
    extraSquares: [],
    wrongPieceSquares: [],

    branches: [],
    selectedBranchId: null,
    errorSquares: [],
});

export const useGameStore = create<GameStoreState>((set, get) => ({
    activeGames: [],
    setActiveGames: (games) => set({ activeGames: games }),
    patchActiveGame: (gameID, patch) =>
        set((state) => ({
            activeGames: state.activeGames.map((g) =>
                g.gameID === gameID ? { ...g, ...patch } : g
            ),
        })),
    removeActiveGame: (gameID) =>
        set((state) => ({
            activeGames: state.activeGames.filter((game) => game.gameID !== gameID),
        })),
    upsertActiveGame: (game, boardID) =>
        set((state) => {
            const filtered = state.activeGames.filter((candidate) =>
                candidate.gameID !== game.gameID && (!boardID || candidate.boardID !== boardID),
            );
            return { activeGames: [game, ...filtered] };
        }),

    physicalBoards: [],
    patchPhysicalBoard: (board) =>
        set((state) => {
            const existing = state.physicalBoards.find((b) => b.boardID === board.boardID);
            // Don't add a brand-new entry just to mark it offline
            if (!existing && !board.online) return state;
            const merged: PhysicalBoard = {
                gameID: null,
                gameStatus: null,
                online: false,
                ...existing,
                ...board,
            };
            return {
                physicalBoards: [
                    ...state.physicalBoards.filter((b) => b.boardID !== board.boardID),
                    merged,
                ],
            };
        }),

    patchPhysicalBoardGameStatus: (gameID, gameStatus) =>
        set((state) => ({
            physicalBoards: state.physicalBoards.map((b) =>
                b.gameID === gameID ? { ...b, gameStatus } : b
            ),
        })),

    removePhysicalBoard: (boardID) =>
        set((state) => ({
            physicalBoards: state.physicalBoards.filter((b) => b.boardID !== boardID),
        })),

    clearPhysicalBoardGameID: (gameID) =>
        set((state) => ({
            physicalBoards: state.physicalBoards.map((b) =>
                b.gameID === gameID ? { ...b, gameID: null, gameStatus: null } : b
            ),
        })),

    boards: {},
    patchBoard: (gameID, patch) =>
        set((state) => ({
            boards: {
                ...state.boards,
                [gameID]: { ...(state.boards[gameID] ?? defaultBoard()), ...patch },
            },
        })),
    getBoard: (gameID) => get().boards[gameID],
}));

