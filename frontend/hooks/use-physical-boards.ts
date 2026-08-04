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
    let inFlight = false;
    const controller = new AbortController();

    const fetchBoards = async (initial: boolean) => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch("/boards", { signal: controller.signal });

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
        inFlight = false;
        if (initial && !cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchBoards(true);
    const id = setInterval(() => void fetchBoards(false), 30_000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, [patchPhysicalBoard, removePhysicalBoard]);

  // Live updates via Socket.io
  useEffect(() => {
    // Dev: log socket presence so we can see when client connects
    try {
      // eslint-disable-next-line no-console
    } catch (e) {}
    if (!socket) return;

    const unwrap = (rawData: any) => (Array.isArray(rawData) && rawData.length === 1 ? rawData[0] : rawData);

    const onOffline = (rawData: any) => {
      const payload = unwrap(rawData);
      if (!payload || typeof payload.boardID !== "string") return;
      const { boardID } = payload;
      // Dev: log offline events
      try {
        // eslint-disable-next-line no-console
      } catch (e) {}
      removePhysicalBoard(boardID);
      try {
        // eslint-disable-next-line no-console
      } catch (e) {}
    };

    const onGameStatusUpdate = (rawData: any) => {
      const payload = unwrap(rawData);
      if (!payload || typeof payload.gameID !== "string" || typeof payload.status !== "string") return;
      const { gameID, status } = payload;
      if (status === GAME_STATUS.FINISHED) {
        // Game ended — detach board so card shows "Ready" and can start a new game
        clearPhysicalBoardGameID(gameID);
      } else {
        patchPhysicalBoardGameStatus(gameID, status as PhysicalBoard["gameStatus"]);
      }
    };

    const onScanOk = (rawData: any) => {
      const payload = unwrap(rawData);
      if (!payload || typeof payload.boardID !== "string") return;

      const board: PhysicalBoard = {
        boardID: payload.boardID,
        gameID: payload.gameID,
        gameStatus: payload.status === "ok" ? "active" : payload.status,
        online: true,
      };

      patchPhysicalBoard(board);
    };

    socket.on(SOCKET_CONSTANTS.BOARD_OFFLINE, onOffline);
    socket.on(SOCKET_CONSTANTS.GAME_STATUS_UPDATE, onGameStatusUpdate);
    socket.on(SOCKET_CONSTANTS.BOARD_SCAN_OK, onScanOk);

    return () => {
      socket.off(SOCKET_CONSTANTS.BOARD_OFFLINE, onOffline);
      socket.off(SOCKET_CONSTANTS.GAME_STATUS_UPDATE, onGameStatusUpdate);
      socket.off(SOCKET_CONSTANTS.BOARD_SCAN_OK, onScanOk);
    };
  }, [socket, patchPhysicalBoard, patchPhysicalBoardGameStatus, removePhysicalBoard, clearPhysicalBoardGameID]);

  return { boards: physicalBoards, loading };
}
