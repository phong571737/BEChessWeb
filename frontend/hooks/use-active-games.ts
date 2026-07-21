"use client"

import { useSocket } from "@/components/providers/socket-provider";
import { SOCKET_CONSTANTS, SERVER_EVENT } from "@/lib/constants/socket";
import { fetchJSONCached, invalidateFetchCache } from "@/lib/fetch-cache";
import { useGameStore } from "@/lib/store";
import { ActiveGame } from "@/types/game.types";
import { useCallback, useEffect, useState } from "react";

export function useActiveGames() {
    const { activeGames, setActiveGames, patchActiveGame } = useGameStore();
    const socket = useSocket();

    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            setLoading(true);
            const games = await fetchJSONCached<ActiveGame[]>("/games/current", 2_000);
            setActiveGames(games);
        } catch (err) {
            console.error("Failed to load active games", err);
        } finally {
            setLoading(false);
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
            refresh();
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
        socket.on(SOCKET_CONSTANTS.GAME_CREATED, onChanged);
        socket.on(SOCKET_CONSTANTS.GAME_DESTROYED, onChanged);
        socket.on(SOCKET_CONSTANTS.BOARD_SCAN_OK, onChanged);
        socket.on(SOCKET_CONSTANTS.GAME_STATUS_UPDATE, onChanged);
        socket.on(SOCKET_CONSTANTS.GAME_MOVE, onMove);
        socket.on(SERVER_EVENT.ESP_MOVE, onEspMove);
        return () => {
            socket.off(SOCKET_CONSTANTS.GAME_CREATED, onChanged);
            socket.off(SOCKET_CONSTANTS.GAME_DESTROYED, onChanged);
            socket.off(SOCKET_CONSTANTS.BOARD_SCAN_OK, onChanged);
            socket.off(SOCKET_CONSTANTS.GAME_STATUS_UPDATE, onChanged);
            socket.off(SOCKET_CONSTANTS.GAME_MOVE, onMove);
            socket.off(SERVER_EVENT.ESP_MOVE, onEspMove);
        };
    }, [socket, refresh, patchActiveGame]);

    return { loading, refresh, activeGames };
}