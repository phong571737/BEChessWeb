"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/store";
import { useSocket } from "@/hooks/use-socket";
import type { PhysicalBoard } from "@/types/game.types";

// Phase 1 — 55 s: mark board as offline (show "Offline" state on card).
// Phase 2 — 65 s: remove board from the list entirely.
// 55 s is safely above the 30 s normal heartbeat interval (1.8× miss tolerance).
const CLIENT_STALE_MS   = 55_000;
const CLIENT_OFFLINE_TTL = 65_000;

export function usePhysicalBoards(): { boards: PhysicalBoard[]; loading: boolean } {
  const { physicalBoards, patchPhysicalBoard, patchPhysicalBoardGameStatus, removePhysicalBoard, clearPhysicalBoardGameID } = useGameStore();
  const socket = useSocket();
  const [loading, setLoading] = useState(true);

  // Fetch (or re-fetch) the full board list from the server.
  // Called once on mount and then every 30 s to keep gameStatus in sync —
  // heartbeat events don't carry gameStatus, so periodic re-sync is needed.
  useEffect(() => {
    let cancelled = false;

    const fetchBoards = (initial: boolean) => {
      fetch("/boards")
        .then((r) => r.json())
        .then((list: PhysicalBoard[]) => {
          if (cancelled) return;
          const now = Date.now();
          list.forEach((b) => {
            const age = now - b.lastSeen;
            if (age > CLIENT_OFFLINE_TTL) {
              // Board is stale — don't re-add it even if the server still has it
              removePhysicalBoard(b.boardID);
            } else if (age > CLIENT_STALE_MS) {
              patchPhysicalBoard({ ...b, online: false });
            } else {
              patchPhysicalBoard(b);
            }
          });
        })
        .catch((err) => console.warn("[usePhysicalBoards] fetch error", err instanceof Error ? err.message : err))
        .finally(() => { if (initial && !cancelled) setLoading(false); });
    };

    fetchBoards(true);
    const id = setInterval(() => fetchBoards(false), 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [patchPhysicalBoard, removePhysicalBoard]);

  // Client-side staleness check — runs every 5 s.
  // Phase 1 (55 s): set online: false so the card shows "Offline" styling.
  // Phase 2 (65 s): remove the board from the list entirely.
  // This runs independently of the server's 90 s TTL, giving faster UI feedback.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      for (const board of useGameStore.getState().physicalBoards) {
        if (board.lastSeen <= 0) continue;
        const age = now - board.lastSeen;
        if (age > CLIENT_OFFLINE_TTL) {
          removePhysicalBoard(board.boardID);
        } else if (age > CLIENT_STALE_MS && board.online) {
          patchPhysicalBoard({ ...board, online: false });
        }
      }
    }, 5_000);
    return () => clearInterval(id);
  }, [removePhysicalBoard, patchPhysicalBoard]);

  // Live updates via Socket.io
  useEffect(() => {
    if (!socket) return;

    const onHeartbeat = (board: PhysicalBoard) => patchPhysicalBoard(board);

    const onOffline = ({ boardID }: { boardID: string }) => {
      removePhysicalBoard(boardID);
    };

    const onGameStatusUpdate = ({ gameID, status }: { gameID: string; status: string }) => {
      if (status === "finished") {
        // Game ended — detach board so card shows "Ready" and can start a new game
        clearPhysicalBoardGameID(gameID);
      } else {
        patchPhysicalBoardGameStatus(gameID, status as PhysicalBoard["gameStatus"]);
      }
    };

    socket.on("board_heartbeat", onHeartbeat);
    socket.on("board_offline",   onOffline);
    socket.on("game_status_update", onGameStatusUpdate);

    return () => {
      socket.off("board_heartbeat", onHeartbeat);
      socket.off("board_offline",   onOffline);
      socket.off("game_status_update", onGameStatusUpdate);
    };
  }, [socket, patchPhysicalBoard, patchPhysicalBoardGameStatus, removePhysicalBoard, clearPhysicalBoardGameID]);

  return { boards: physicalBoards, loading };
}
