"use client"

import { useSocket } from "@/components/providers/socket-provider";
import { SOCKET_CONSTANTS, SERVER_EVENT } from "@/lib/constants/socket";
import { fetchJSONCached, invalidateFetchCache } from "@/lib/fetch-cache";
import { useGameStore } from "@/lib/store";
import { ActiveGame } from "@/types/game.types";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";

export function useActiveGames() {
    const { activeGames, setActiveGames, patchActiveGame, removeActiveGame, upsertActiveGame } = useGameStore();
    const socket = useSocket();

    const [loading, setLoading] = useState(true);
    const refreshSequence = useRef(0);

    const refresh = useCallback(async () => {
        const sequence = ++refreshSequence.current;
        try {
            setLoading(true);
            const games = await fetchJSONCached<ActiveGame[]>("/games/current", 2_000);
            if (sequence === refreshSequence.current) setActiveGames(games);
        } catch (err) {
            console.error("Failed to load active games", err);
        } finally {
            if (sequence === refreshSequence.current) setLoading(false);
        }
    }, [setActiveGames]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // Refresh list when a game is created, ends, or changes status
    // (e.g. waiting_scan → active after a successful board scan)
    useEffect(() => {
        if (!socket) return;
        const onChanged = () => {
            invalidateFetchCache("/games/current");
            void refresh();
        };
        // Patch FEN/lastMove on individual game cards without a full re-fetch
        const onMove = (data: { gameID: string; fen: string; lastMove: ActiveGame["lastMove"] }) => {
            patchActiveGame(data.gameID, { fen: data.fen, lastMove: data.lastMove });
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
            if (data.status === "finished") removeActiveGame(data.gameID);
            onChanged();
        };
        const onBoardScanOk = (rawData: any) => {
            const data = Array.isArray(rawData) && rawData.length === 1 ? rawData[0] : rawData;
            if (!data || typeof data.gameID !== "string") {
                onChanged();
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
            onChanged();
        };
        socket.on(SOCKET_CONSTANTS.GAME_CREATED, onChanged);
        socket.on(SOCKET_CONSTANTS.GAME_DESTROYED, onChanged);
        socket.on(SOCKET_CONSTANTS.BOARD_SCAN_OK, onBoardScanOk);
        socket.on(SOCKET_CONSTANTS.GAME_STATUS_UPDATE, onGameStatusUpdate);
        socket.on(SOCKET_CONSTANTS.GAME_MOVE, onMove);
        socket.on(SERVER_EVENT.ESP_MOVE, onEspMove);
        return () => {
            socket.off(SOCKET_CONSTANTS.GAME_CREATED, onChanged);
            socket.off(SOCKET_CONSTANTS.GAME_DESTROYED, onChanged);
            socket.off(SOCKET_CONSTANTS.BOARD_SCAN_OK, onBoardScanOk);
            socket.off(SOCKET_CONSTANTS.GAME_STATUS_UPDATE, onGameStatusUpdate);
            socket.off(SOCKET_CONSTANTS.GAME_MOVE, onMove);
            socket.off(SERVER_EVENT.ESP_MOVE, onEspMove);
        };
    }, [socket, refresh, patchActiveGame, removeActiveGame, upsertActiveGame]);

    return { loading, refresh, activeGames };
}
