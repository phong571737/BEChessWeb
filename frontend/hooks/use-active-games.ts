"use client"

import { useSocket } from "@/components/providers/socket-provider";
import { CLIENT_EVENT, SOCKET_CONSTANTS, SERVER_EVENT } from "@/lib/constants/socket";
import { fetchJSONCached, invalidateFetchCache } from "@/lib/fetch-cache";
import { useGameStore } from "@/lib/store";
import { ActiveGame } from "@/types/game.types";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";

export function useActiveGames() {
    // Subscribe only to the home-card slice. Subscribing to the whole store
    // makes every per-board FEN patch rerender the complete dashboard.
    const activeGames = useGameStore((state) => state.activeGames);
    const setActiveGames = useGameStore((state) => state.setActiveGames);
    const patchActiveGame = useGameStore((state) => state.patchActiveGame);
    const removeActiveGame = useGameStore((state) => state.removeActiveGame);
    const upsertActiveGame = useGameStore((state) => state.upsertActiveGame);
    const socket = useSocket();

    const [loading, setLoading] = useState(true);
    const refreshSequence = useRef(0);

    const fetchGames = useCallback(async (showLoading: boolean) => {
        const sequence = ++refreshSequence.current;
        try {
            if (showLoading) setLoading(true);
            const games = await fetchJSONCached<ActiveGame[]>("/games/current", 2_000);
            if (sequence === refreshSequence.current) setActiveGames(games);
        } catch (err) {
            console.error("Failed to load active games", err);
        } finally {
            if (showLoading && sequence === refreshSequence.current) setLoading(false);
        }
    }, [setActiveGames]);

    // Keep the public refresh API compatible with button and dialog handlers.
    const refresh = useCallback(() => fetchGames(true), [fetchGames]);
    const refreshSilently = useCallback(() => fetchGames(false), [fetchGames]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // Refresh list when a game is created, ends, or changes status
    // (e.g. waiting_scan → active after a successful board scan)
    useEffect(() => {
        if (!socket) return;
        const requestSnapshot = () => socket.emit(CLIENT_EVENT.REQUEST_ACTIVE_GAMES);
        const onActiveGamesSnapshot = (rawData: unknown) => {
            const games = Array.isArray(rawData) ? rawData : [];
            setActiveGames(games as ActiveGame[]);
            setLoading(false);
        };
        const reconcileSilently = () => {
            invalidateFetchCache("/games/current");
            if (socket.connected) {
                socket.emit(CLIENT_EVENT.REQUEST_ACTIVE_GAMES);
            } else {
                void refreshSilently();
            }
        };
        // Patch FEN/lastMove on individual game cards without a full re-fetch
        const onMove = (data: { gameID: string; fen: string; lastMove: ActiveGame["lastMove"]; lastSeq?: number }) => {
            if (!data || typeof data.gameID !== "string" || typeof data.fen !== "string") return;
            patchActiveGame(data.gameID, {
                fen: data.fen,
                lastMove: data.lastMove,
                ...(typeof data.lastSeq === "number" ? { lastSeq: data.lastSeq } : {}),
            });
        };
        // esp_move is emitted by the server when a physical board move is processed (contains authoritative FEN)
        const onEspMove = (rawData: any) => {
            const data = Array.isArray(rawData) && rawData.length === 1 ? rawData[0] : rawData;
            onMove(data);
        };
        const onGameStatusUpdate = (rawData: any) => {
            const data = Array.isArray(rawData) && rawData.length === 1 ? rawData[0] : rawData;
            if (!data || typeof data.gameID !== "string") return;
            // Remove the terminal game immediately.  The follow-up board_scan_ok
            // event will insert the newly-created waiting game, so an old FEN
            // cannot remain visible while the list request is in flight.
            if (data.status === "finished") {
                removeActiveGame(data.gameID);
            } else if (typeof data.status === "string") {
                patchActiveGame(data.gameID, { status: data.status });
            }
            reconcileSilently();
        };
        const onBoardScanOk = (rawData: any) => {
            const data = Array.isArray(rawData) && rawData.length === 1 ? rawData[0] : rawData;
            if (!data || typeof data.gameID !== "string") {
                reconcileSilently();
                return;
            }
            // Hydrate the new game directly so the mini-board immediately uses
            // its starting FEN instead of waiting for a potentially racing list
            // refresh. The list refresh remains the reconciliation fallback.
            void apiFetch(`/games/${encodeURIComponent(data.gameID)}`, { cache: "no-store" })
                .then((response) => response.ok ? response.json() : null)
                .then((game) => {
                    if (game && typeof game.gameID === "string") {
                        upsertActiveGame(game as ActiveGame, typeof data.boardID === "string" ? data.boardID : undefined);
                    }
                })
                .catch((error) => console.warn("Failed to hydrate replacement game", error));
            reconcileSilently();
        };
        socket.on(SOCKET_CONSTANTS.GAME_CREATED, reconcileSilently);
        socket.on(SOCKET_CONSTANTS.GAME_DESTROYED, reconcileSilently);
        socket.on(SOCKET_CONSTANTS.BOARD_SCAN_OK, onBoardScanOk);
        socket.on(SOCKET_CONSTANTS.GAME_STATUS_UPDATE, onGameStatusUpdate);
        socket.on(SOCKET_CONSTANTS.GAME_MOVE, onMove);
        socket.on(SERVER_EVENT.ESP_MOVE, onEspMove);
        socket.on(SERVER_EVENT.ACTIVE_GAMES_SNAPSHOT, onActiveGamesSnapshot);
        socket.on("connect", requestSnapshot);
        requestSnapshot();
        return () => {
            socket.off(SOCKET_CONSTANTS.GAME_CREATED, reconcileSilently);
            socket.off(SOCKET_CONSTANTS.GAME_DESTROYED, reconcileSilently);
            socket.off(SOCKET_CONSTANTS.BOARD_SCAN_OK, onBoardScanOk);
            socket.off(SOCKET_CONSTANTS.GAME_STATUS_UPDATE, onGameStatusUpdate);
            socket.off(SOCKET_CONSTANTS.GAME_MOVE, onMove);
            socket.off(SERVER_EVENT.ESP_MOVE, onEspMove);
            socket.off(SERVER_EVENT.ACTIVE_GAMES_SNAPSHOT, onActiveGamesSnapshot);
            socket.off("connect", requestSnapshot);
        };
    }, [socket, refreshSilently, patchActiveGame, removeActiveGame, setActiveGames, upsertActiveGame]);

    return { loading, refresh, activeGames };
}
