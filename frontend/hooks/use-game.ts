import { useSocket } from "@/components/providers/socket-provider";
import { invalidateFetchCache } from "@/lib/fetch-cache";
import { useGameStore } from "@/lib/store";
import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js"

export interface boardAlert {
    code: string;
    detail: string;
}

export function useGame(gameID: string) {
    const {patchBoard, boards} = useGameStore();
    const socket = useSocket();
    const [isLoaded, setIsLoaded] = useState(false);
    const [moveTimesMap, setMoveTimesMap] = useState<Record<number, number>>({});
    const cachedBoard = boards[gameID];

    // ------- Move timing -----------------------------
    const storageKey = `chess:moveAt:${gameID}`;
    const [lastMoveAt, setLastMoveAt] = useState<number>(() => {
        try {
            const stored = sessionStorage.getItem(storageKey);
            if (stored) return Number(stored);
        } catch {}
        return Date.now();
    });

    useEffect(() => {
        if (!socket || !gameID) return;
        const join = () => socket.emit("join", {gameID});
        join();
        socket.on("connect", join);
        return () => {socket.off("connect", join)};
    }, [socket, gameID]);

    // --- PGN history -----------------------------------------
    const board = boards[gameID];
    const moves = useMemo(() => {
        const pgn = board?.pgn ?? "";
        if (!pgn.trim()) return [];
        try {
            const c = new Chess();
            c.loadPgn(pgn);
            return c.history();
        } catch {
            return [];
        }
    }, [board?.pgn]);

    // ----- Game actions ---------------------------------------
    const restart = async () => {
        await fetch(`/games/${gameID}/restart`, { method: "POST"});
        invalidateFetchCache(`/games/${gameID}`);
        invalidateFetchCache("/games/current");
        invalidateFetchCache("/games/history");
    }

    // Resign
    const resign = async (resignSide: "white" | "black" | "draw" = "white") => {
        await fetch(`/games/${gameID}/resign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resignSide }),
        });
        invalidateFetchCache(`/games/${gameID}`);
        invalidateFetchCache("/games/current");
        invalidateFetchCache("/games/history");
    };

    return {
        fen: board?.fen ?? "start",
        pgn: board?.pgn ?? "",
        WhiteName: board?.WhiteName ?? "White",
        BlackName: board?.BlackName ?? "Black",
        lastMove: board?.lastMove ?? null,
        boardConnected: board?.boardConnected ?? false,
        restart,
        resign,
        isLoaded,
        lastMoveAt,
        moveTimesMap
    }
}