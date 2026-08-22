import type { ActiveGame, BoardState, PhysicalBoard } from "@/types/game.types";

/** Normalized game entry for layout picker */
export interface PickerGame {
    gameID: string;
    whiteName: string;
    blackName: string;
    /** Physical board id when available */
    boardLabel?: string;
}

export function formatPickerLabel(g: PickerGame | undefined, gameID?: string): string {
    if (!g) {
        if (gameID) return `Game ${gameID.slice(-8)}`;
        return "—";
    }
    const white = g.whiteName?.trim() || "White";
    const black = g.blackName?.trim() || "Black";
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
        whiteName: white?.trim() || "White",
        blackName: black?.trim() || "Black",
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
                white || existing?.whiteName || fromStore?.whiteName,
                black || existing?.blackName || fromStore?.blackName,
                boardLabelByGame.get(gameID)
            )
        );
    };

    for (const g of activeGames) {
        if (!g.gameID) continue;
        upsert(g.gameID, g.whiteName, g.blackName);
    }

    for (const id of slotIds) {
        upsert(id, boards[id]?.whiteName, boards[id]?.blackName);
    }

    for (const pb of physicalBoards) {
        if (!pb.gameID || pb.gameStatus !== "active") continue;
        upsert(pb.gameID, boards[pb.gameID]?.whiteName, boards[pb.gameID]?.blackName);
    }

    for (const [id, b] of Object.entries(boards)) {
        if (map.has(id)) continue;
        if (b.status === "ended") continue;
        upsert(id, b.whiteName, b.blackName);
    }

    return Array.from(map.values()).slice(0, 3);
}

export function pickerGameMap(games: PickerGame[]): Map<string, PickerGame> {
    return new Map(games.map((g) => [g.gameID, g]));
}
