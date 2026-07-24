import type { ActiveGame, BoardState, PhysicalBoard } from "@/types/game.types";

/** Normalized game entry for layout picker */
export interface PickerGame {
    gameID: string;
    WhiteName: string;
    BlackName: string;
    /** Physical board id when available */
    boardLabel?: string;
}

export function formatPickerLabel(g: PickerGame | undefined, gameID?: string): string {
    if (!g) {
        if (gameID) return `Game ${gameID.slice(-8)}`;
        return "—";
    }
    const white = g.WhiteName?.trim() || "White";
    const black = g.BlackName?.trim() || "Black";
    const names = `${white} vs ${black}`;
    if (g.boardLabel && white === "White" && black === "Black") {
        return `${g.boardLabel} — ${names}`;
    }
    return names;
}

function toPickerGame(
    gameID: string,
    white?: string | null,
    black?: string | null,
    boardLabel?: string
): PickerGame {
    return {
        gameID,
        WhiteName: white?.trim() || "White",
        BlackName: black?.trim() || "Black",
        boardLabel,
    };
}

/**
 * Merge active games, live board store, physical boards, and URL slot ids.
 * Returns at most 3 unique games for the header picker.
 */
export function buildPickerGames(
    activeGames: ActiveGame[],
    boards: Record<string, BoardState>,
    physicalBoards: PhysicalBoard[],
    slotIds: string[] = []
): PickerGame[] {
    const map = new Map<string, PickerGame>();

    const boardLabelByGame = new Map<string, string>();
    for (const pb of physicalBoards) {
        if (pb.gameID) boardLabelByGame.set(pb.gameID, pb.boardID);
    }

    const upsert = (gameID: string, white?: string | null, black?: string | null) => {
        if (!gameID) return;
        const existing = map.get(gameID);
        const fromStore = boards[gameID];
        map.set(
            gameID,
            toPickerGame(
                gameID,
                white || existing?.WhiteName || fromStore?.WhiteName,
                black || existing?.BlackName || fromStore?.BlackName,
                boardLabelByGame.get(gameID)
            )
        );
    };

    for (const g of activeGames) {
        if (!g.gameID) continue;
        upsert(g.gameID, g.WhiteName, g.BlackName);
    }

    for (const id of slotIds) {
        upsert(id, boards[id]?.WhiteName, boards[id]?.BlackName);
    }

    for (const pb of physicalBoards) {
        if (!pb.gameID || pb.gameStatus !== "active") continue;
        upsert(pb.gameID, boards[pb.gameID]?.WhiteName, boards[pb.gameID]?.BlackName);
    }

    for (const [id, b] of Object.entries(boards)) {
        if (map.has(id)) continue;
        if (b.status === "ended") continue;
        upsert(id, b.WhiteName, b.BlackName);
    }

    return Array.from(map.values()).slice(0, 3);
}

export function pickerGameMap(games: PickerGame[]): Map<string, PickerGame> {
    return new Map(games.map((g) => [g.gameID, g]));
}
