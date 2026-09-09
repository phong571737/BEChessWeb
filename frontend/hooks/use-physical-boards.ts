"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/store";
import { useSocket } from "@/components/providers/socket-provider";
import type { PhysicalBoard } from "@/types/game.types";
import { SOCKET_CONSTANTS, SERVER_EVENT } from "@/lib/constants/socket";
import { GAME_STATUS } from "@/lib/constants/game";

export function usePhysicalBoards(): { boards: PhysicalBoard[]; loading: boolean } {
  // Physical-board events must not subscribe this hook to every chess-board
  // state update; only the physical-board slice is relevant here.
  const physicalBoards = useGameStore((state) => state.physicalBoards);
  const patchPhysicalBoard = useGameStore((state) => state.patchPhysicalBoard);
  const patchPhysicalBoardGameStatus = useGameStore((state) => state.patchPhysicalBoardGameStatus);
  const removePhysicalBoard = useGameStore((state) => state.removePhysicalBoard);
  const clearPhysicalBoardGameID = useGameStore((state) => state.clearPhysicalBoardGameID);
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
            initStatus: g.initStatus,
            missingSquares: Array.isArray(g.missingSquares) ? g.missingSquares : [],
            extraSquares: Array.isArray(g.extraSquares) ? g.extraSquares : [],
            wrongPieceSquares: Array.isArray(g.wrongPieceSquares) ? g.wrongPieceSquares : [],
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
    if (!socket) return;

    const unwrap = (rawData: any) => (Array.isArray(rawData) && rawData.length === 1 ? rawData[0] : rawData);

    const onOffline = (rawData: any) => {
      const payload = unwrap(rawData);
      if (!payload || typeof payload.boardID !== "string") return;
      const { boardID } = payload;
      removePhysicalBoard(boardID);
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

    const onBoardReset = (rawData: any) => {
      const payload = unwrap(rawData);
      if (!payload || typeof payload.boardID !== "string") return;
      patchPhysicalBoard({
        boardID: payload.boardID,
        online: true,
        initStatus: "checkinit",
        resetConfirmedAt: typeof payload.confirmedAt === "number" ? payload.confirmedAt : Date.now(),
      });
    };

    // Initial-position validation is emitted for every connected client.
    // Keep it with the physical board so the home-card can show errors before
    // an administrator opens the individual board page.
    const onGameState = (rawData: any) => {
      const payload = unwrap(rawData);
      const boardID = typeof payload?.boardID === "string"
        ? payload.boardID
        : typeof payload?.gameID === "string" ? payload.gameID : null;
      if (!boardID) return;
      patchPhysicalBoard({
        boardID,
        online: true,
        initStatus: typeof payload.initResultStatus === "string" ? payload.initResultStatus : payload.gameStatus,
        missingSquares: Array.isArray(payload.missingSquares) ? payload.missingSquares : [],
        extraSquares: Array.isArray(payload.extraSquares) ? payload.extraSquares : [],
        wrongPieceSquares: Array.isArray(payload.wrongPieceSquares) ? payload.wrongPieceSquares : [],
      });
    };

    socket.on(SOCKET_CONSTANTS.BOARD_OFFLINE, onOffline);
    socket.on(SOCKET_CONSTANTS.GAME_STATUS_UPDATE, onGameStatusUpdate);
    socket.on(SOCKET_CONSTANTS.BOARD_SCAN_OK, onScanOk);
    socket.on("board_reset", onBoardReset);
    socket.on(SERVER_EVENT.GAME_STATE, onGameState);

    return () => {
      socket.off(SOCKET_CONSTANTS.BOARD_OFFLINE, onOffline);
      socket.off(SOCKET_CONSTANTS.GAME_STATUS_UPDATE, onGameStatusUpdate);
      socket.off(SOCKET_CONSTANTS.BOARD_SCAN_OK, onScanOk);
      socket.off("board_reset", onBoardReset);
      socket.off(SERVER_EVENT.GAME_STATE, onGameState);
    };
  }, [socket, patchPhysicalBoard, patchPhysicalBoardGameStatus, removePhysicalBoard, clearPhysicalBoardGameID]);

  return { boards: physicalBoards, loading };
}
