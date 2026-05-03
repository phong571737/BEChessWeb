"use client";

import { useEffect, useCallback } from "react";
import { useState } from "react";
import { useGameStore } from "@/lib/store";
import { useSocket } from "@/hooks/use-socket";
import type { ActiveGame } from "@/types/game.types";
import { fetchJSONCached, invalidateFetchCache } from "@/lib/fetch-cache";

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
    socket.on("game:created",        onChanged);
    socket.on("game:destroyed",      onChanged);
    socket.on("board_scan_ok",       onChanged);
    socket.on("game_status_update",  onChanged);
    socket.on("game:move",           onMove);
    return () => {
      socket.off("game:created",       onChanged);
      socket.off("game:destroyed",     onChanged);
      socket.off("board_scan_ok",      onChanged);
      socket.off("game_status_update", onChanged);
      socket.off("game:move",          onMove);
    };
  }, [socket, refresh, patchActiveGame]);

  return { activeGames, refresh, loading };
}
