"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Chess } from "chess.js";
import { useGameStore } from "@/lib/store";
import { useSocket } from "@/hooks/use-socket";
import { fetchJSONCached, invalidateFetchCache } from "@/lib/fetch-cache";

export interface BoardAlert {
  code: string;
  detail: string;
}

export function useGame(gameID: string) {
  const { patchBoard, boards } = useGameStore();
  const socket = useSocket();
  const chessRef = useRef<Chess>(new Chess());
  const [isLoaded, setIsLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [rescanLoading, setRescanLoading] = useState(false);
  const [boardOffline, setBoardOffline] = useState(false);
  const [activeAlert, setActiveAlert] = useState<BoardAlert | null>(null);
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cachedBoard = boards[gameID];

  // ── Move timing ────────────────────────────────────────────────
  const storageKey = `chess:movedAt:${gameID}`;

  const [lastMoveAt, setLastMoveAt] = useState<number>(() => {
    try {
      const stored = sessionStorage.getItem(`chess:movedAt:${gameID}`);
      if (stored) return Number(stored);
    } catch {}
    return Date.now();
  });

  const lastMoveAtRef       = useRef<number>(lastMoveAt);
  const initialMoveCountRef = useRef<number>(0);
  const sessionTs           = useRef<number[]>([]);
  const [moveTimesMap, setMoveTimesMap] = useState<Record<number, number>>({});

  // ── Dismiss alert helper ───────────────────────────────────────
  const dismissAlert = useCallback(() => {
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    setActiveAlert(null);
  }, []);

  // ── Early socket join — happens as soon as socket + gameID available.
  // Does NOT wait for isLoaded, so scan events reach the client immediately
  // when the board page is showing the waiting_scan / scan_failed overlay.
  // Re-joins on every reconnect so room membership survives network hiccups.
  useEffect(() => {
    if (!socket || !gameID) return;
    const join = () => socket.emit("join", { gameID });
    join();
    socket.on("connect", join);
    return () => { socket.off("connect", join); };
  }, [socket, gameID]);

  // ── Scan + offline + alert events ─────────────────────────────
  useEffect(() => {
    if (!socket || !gameID) return;

    const onScanOk = (data: any) => {
      if (data.gameID !== gameID) return;
      setBoardOffline(false);
      patchBoard(gameID, { status: "playing", boardConnected: true, scanMissing: [], scanReason: null });
      // Reset the thinking clock — scan duration must not count as move time.
      const now = Date.now();
      lastMoveAtRef.current = now;
      sessionTs.current = [];
      try { sessionStorage.removeItem(storageKey); } catch {}
      setLastMoveAt(now);
      setMoveTimesMap({});
    };

    const onScanFailed = (data: any) => {
      if (data.gameID !== gameID) return;
      patchBoard(gameID, {
        status: "scan_failed",
        scanMissing: data.missing ?? [],
        scanReason: data.reason ?? "MISSING",
      });
    };

    const onGameStatusUpdate = (data: any) => {
      if (data.gameID !== gameID) return;
      if (data.status === "waiting_scan") {
        patchBoard(gameID, { status: "waiting_scan", scanMissing: [], scanReason: null });
      } else if (data.status === "scan_failed") {
        patchBoard(gameID, { status: "scan_failed" });
      } else if (data.status === "active") {
        patchBoard(gameID, { status: "playing", boardConnected: true });
      } else if (data.status === "finished") {
        patchBoard(gameID, { status: "ended", result: data.result ?? undefined });
      }
    };

    const onBoardOffline = (data: any) => {
      if (data.gameID !== gameID) return;
      setBoardOffline(true);
      patchBoard(gameID, { boardConnected: false });
    };

    const onAlert = (data: any) => {
      if (data.gameID !== gameID) return;
      const alert: BoardAlert = { code: data.code, detail: data.detail ?? "" };
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
      setActiveAlert(alert);
      // Auto-dismiss after 6 s
      alertTimerRef.current = setTimeout(() => setActiveAlert(null), 6_000);
    };

    socket.on("board_scan_ok",      onScanOk);
    socket.on("board_scan_failed",  onScanFailed);
    socket.on("game_status_update", onGameStatusUpdate);
    socket.on("board_offline",      onBoardOffline);
    socket.on("board_alert",        onAlert);

    return () => {
      socket.off("board_scan_ok",      onScanOk);
      socket.off("board_scan_failed",  onScanFailed);
      socket.off("game_status_update", onGameStatusUpdate);
      socket.off("board_offline",      onBoardOffline);
      socket.off("board_alert",        onAlert);
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    };
  }, [socket, gameID, patchBoard]);

  // ── Load initial game from REST API ───────────────────────────
  useEffect(() => {
    if (!gameID) return;

    if (cachedBoard?.fen) {
      try { if (cachedBoard.pgn) chessRef.current.loadPgn(cachedBoard.pgn); } catch {}
      initialMoveCountRef.current = chessRef.current.history().length;
      sessionTs.current = [];
      setIsLoaded(true);
      return;
    }

    setIsLoaded(false);

    fetchJSONCached<any>(`/games/${gameID}`, 1_500)
      .then((game) => {
        try { if (game.pgn) chessRef.current.loadPgn(game.pgn); } catch {}

        initialMoveCountRef.current = chessRef.current.history().length;

        const storedTs = (() => {
          try { return Number(sessionStorage.getItem(storageKey) || 0); } catch { return 0; }
        })();
        const dbTs = game.movedAt
          ? Number(game.movedAt)
          : game.updateAt
            ? new Date(game.updateAt).getTime()
            : 0;
        const restoredAt = Math.max(storedTs, dbTs) || Date.now();
        lastMoveAtRef.current = restoredAt;
        setLastMoveAt(restoredAt);
        sessionTs.current = [];

        let boardStatus: "playing" | "ended" | "waiting" | "waiting_scan" | "scan_failed" = "playing";
        if (game.status === "waiting_scan") boardStatus = "waiting_scan";
        else if (game.status === "scan_failed") boardStatus = "scan_failed";
        else if (game.status === "finished") boardStatus = "ended";

        patchBoard(gameID, {
          fen:         game.fen  || chessRef.current.fen(),
          pgn:         game.pgn  || "",
          whiteName:   game.WhiteName || "White",
          blackName:   game.BlackName || "Black",
          lastMove:    game.lastMove  || null,
          status:      boardStatus,
          result:      game.result    ?? undefined,
          scanMissing: game.scanMissing ?? [],
          scanReason:  game.scanReason  ?? null,
        });
        setIsLoaded(true);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("404")) setNotFound(true);
        else console.warn("[useGame] load failed:", msg);
        setIsLoaded(true);
      });
  }, [gameID, cachedBoard?.fen, cachedBoard?.pgn]);

  // ── REST polling fallback (5 s) ───────────────────────────────
  // Keeps the board in sync when esp_move Socket.IO events are missed
  // (e.g. socket not in room, WebSocket disconnect, CORS issues).
  useEffect(() => {
    if (!gameID || !isLoaded) return;

    let lastSeenFen: string | null = null;

    const poll = async () => {
      try {
        // ?_t= busts Vercel CDN edge cache (Cache-Control: public, stale-while-revalidate
        // on the upstream response causes the CDN to serve stale for up to 6 s otherwise).
        const res = await fetch(`/games/${gameID}?_t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const game = await res.json();
        if (!game.fen || game.fen === lastSeenFen) return;
        lastSeenFen = game.fen;
        try { if (game.pgn) chessRef.current.loadPgn(game.pgn); } catch {}
        patchBoard(gameID, {
          fen:      game.fen,
          pgn:      game.pgn      || "",
          lastMove: game.lastMove || null,
          ...(game.status === "finished" && { status: "ended", result: game.result }),
        });
      } catch {}
    };

    const id = setInterval(poll, 2_000);
    return () => clearInterval(id);
  }, [gameID, isLoaded, patchBoard]);

  // ── Game socket listeners (after load) ────────────────────────
  useEffect(() => {
    if (!socket || !gameID || !isLoaded) return;

    socket.emit("request_eval", { gameID, fen: chessRef.current.fen() });

    const onMove = (data: any) => {
      if (data.gameID !== gameID) return;

      const now  = data.movedAt ? Number(data.movedAt) : Date.now();
      const idx  = sessionTs.current.length;
      const prevTs   = idx === 0 ? lastMoveAtRef.current : sessionTs.current[idx - 1];
      const duration = now - prevTs;
      const ply      = initialMoveCountRef.current + idx;

      sessionTs.current.push(now);
      lastMoveAtRef.current = now;
      try { sessionStorage.setItem(storageKey, String(now)); } catch {}
      setLastMoveAt(now);
      setMoveTimesMap(prev => ({ ...prev, [ply]: duration }));

      try { if (data.pgn) chessRef.current.loadPgn(data.pgn); } catch {}
      patchBoard(gameID, {
        fen:      data.fen      || chessRef.current.fen(),
        pgn:      data.pgn      || chessRef.current.pgn(),
        lastMove: data.lastMove || null,
      });
      socket.emit("request_eval", { gameID, fen: data.fen || chessRef.current.fen() });
    };

    const onEval = (data: any) => {
      if (data.gameID !== gameID) return;
      patchBoard(gameID, { cp: data.cp });
    };

    const onRestore = (data: any) => {
      if (data.gameID !== gameID) return;
      try { if (data.pgn) chessRef.current.loadPgn(data.pgn); } catch {}
      initialMoveCountRef.current = chessRef.current.history().length;
      const restoredAt = data.movedAt ? Number(data.movedAt) : Date.now();
      lastMoveAtRef.current = restoredAt;
      sessionTs.current = [];
      try { sessionStorage.setItem(storageKey, String(restoredAt)); } catch {}
      setLastMoveAt(restoredAt);
      setMoveTimesMap({});
      patchBoard(gameID, {
        fen:       data.fen       || chessRef.current.fen(),
        pgn:       data.pgn       || "",
        whiteName: data.WhiteName || "White",
        blackName: data.BlackName || "Black",
        lastMove:  data.lastMove  || null,
      });
    };

    const onBoardConnected = (data: any) => {
      if (data.gameID !== gameID) return;
      setBoardOffline(false);
      patchBoard(gameID, { boardConnected: true, status: "playing" });
    };

    const onRenamed = (data: any) => {
      if (data.gameID !== gameID) return;
      const patch: Partial<{ whiteName: string; blackName: string }> = {};
      if (data.WhiteName !== undefined) patch.whiteName = data.WhiteName;
      if (data.BlackName !== undefined) patch.blackName = data.BlackName;
      if (Object.keys(patch).length) patchBoard(gameID, patch);
    };

    const onUpdateAll = (data: any) => {
      if (data.gameID !== gameID) return;
      chessRef.current.reset();
      initialMoveCountRef.current = 0;
      const resetAt = Date.now();
      lastMoveAtRef.current = resetAt;
      sessionTs.current = [];
      try { sessionStorage.removeItem(storageKey); } catch {}
      setLastMoveAt(resetAt);
      setMoveTimesMap({});
      patchBoard(gameID, { fen: chessRef.current.fen(), pgn: "", lastMove: null });
    };

    socket.on("esp_move",        onMove);
    socket.on("eval_update",     onEval);
    socket.on("restore_game",    onRestore);
    socket.on("board_connected", onBoardConnected);
    socket.on("game:renamed",    onRenamed);
    socket.on("update_all_game", onUpdateAll);

    return () => {
      socket.off("esp_move",        onMove);
      socket.off("eval_update",     onEval);
      socket.off("restore_game",    onRestore);
      socket.off("board_connected", onBoardConnected);
      socket.off("game:renamed",    onRenamed);
      socket.off("update_all_game", onUpdateAll);
    };
  }, [socket, gameID, isLoaded]);

  // ── PGN history ────────────────────────────────────────────────
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

  // ── Game actions ───────────────────────────────────────────────
  const restart = async () => {
    await fetch(`/games/${gameID}/restart`, { method: "POST" });
    invalidateFetchCache(`/games/${gameID}`);
    invalidateFetchCache("/games/current");
    invalidateFetchCache("/games/history");
  };

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

  const rescan = async () => {
    patchBoard(gameID, { status: "waiting_scan", scanMissing: [], scanReason: null });
    setBoardOffline(false);
    setRescanLoading(true);
    try {
      await fetch(`/games/${gameID}/rescan`, { method: "POST" });
      invalidateFetchCache(`/games/${gameID}`);
    } catch (e) {
      console.error("[rescan] failed", e);
    } finally {
      setRescanLoading(false);
    }
  };

  return {
    fen:            board?.fen            ?? "start",
    pgn:            board?.pgn            ?? "",
    cp:             board?.cp             ?? null,
    whiteName:      board?.whiteName      ?? "White",
    blackName:      board?.blackName      ?? "Black",
    lastMove:       board?.lastMove       ?? null,
    boardConnected: board?.boardConnected ?? false,
    status:         board?.status         ?? "waiting",
    result:         board?.result         ?? null,
    scanMissing:    board?.scanMissing    ?? [],
    scanReason:     board?.scanReason     ?? null,
    boardOffline,
    activeAlert,
    dismissAlert,
    moves,
    isLoaded,
    notFound,
    restart,
    resign,
    rescan,
    rescanLoading,
    chess:        chessRef.current,
    lastMoveAt,
    moveTimesMap,
  };
}
