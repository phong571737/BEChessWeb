"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/store";
import { useSocket } from "@/components/providers/socket-provider";
import type { PhysicalBoard } from "@/types/game.types";
import { SOCKET_CONSTANTS } from "@/lib/constants/socket";
import { GAME_STATUS } from "@/lib/constants/game";

export function usePhysicalBoards(): { boards: PhysicalBoard[]; loading: boolean } {
  const { physicalBoards, patchPhysicalBoard, patchPhysicalBoardGameStatus, removePhysicalBoard, clearPhysicalBoardGameID } = useGameStore();
  const socket = useSocket();
  const [loading, setLoading] = useState(true);

  // Fetch (or re-fetch) the full board list from the server.
  // Called once on mount and then every 30 s to keep gameStatus in sync —
  // heartbeat events don't carry gameStatus, so periodic re-sync is needed.
  useEffect(() => {
    let cancelled = false;

    const fetchBoards = async (initial: boolean) => {
      try {
        const res = await fetch("/boards");

        const games = await res.json();

        if (cancelled) return;

        games.forEach((g: any) => {
          const board: PhysicalBoard = {
            boardID: g.boardID,
            gameID: g.gameID,
            gameStatus:
              g.status === "ok"
                ? "active"
                : g.status,
            online: true,
          };

          patchPhysicalBoard(board);
        });
      } catch (err) {
        console.warn(
          "[usePhysicalBoards] fetch error",
          err instanceof Error ? err.message : err
        );
      } finally {
        if (initial && !cancelled) {
          setLoading(false);
        }
      }
    };

    fetchBoards(true);
    const id = setInterval(() => fetchBoards(false), 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [patchPhysicalBoard, removePhysicalBoard]);

  // Live updates via Socket.io
  useEffect(() => {
    if (!socket) return;

    const onHeartbeat = (board: PhysicalBoard) => patchPhysicalBoard(board);

    const onOffline = ({ boardID }: { boardID: string }) => {
      removePhysicalBoard(boardID);
    };

    const onGameStatusUpdate = ({ gameID, status }: { gameID: string; status: string }) => {
      if (status === GAME_STATUS.FINISHED) {
        // Game ended — detach board so card shows "Ready" and can start a new game
        clearPhysicalBoardGameID(gameID);
      } else {
        patchPhysicalBoardGameStatus(gameID, status as PhysicalBoard["gameStatus"]);
      }
    };

    socket.on(SOCKET_CONSTANTS.BOARD_OFFLINE, onOffline);
    socket.on(SOCKET_CONSTANTS.GAME_STATUS_UPDATE, onGameStatusUpdate);

    return () => {
      socket.off(SOCKET_CONSTANTS.BOARD_OFFLINE, onOffline);
      socket.off(SOCKET_CONSTANTS.GAME_STATUS_UPDATE, onGameStatusUpdate);
    };
  }, [socket, patchPhysicalBoard, patchPhysicalBoardGameStatus, removePhysicalBoard, clearPhysicalBoardGameID]);

  return { boards: physicalBoards, loading };
}
