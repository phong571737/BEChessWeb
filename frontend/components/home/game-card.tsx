"use client"

import { ActiveGame, PhysicalBoard } from "@/types/game.types";
import dynamic from "next/dynamic"
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useEffect, useMemo } from "react";
import { encodeGameID } from "@/lib/id-utils";
import { useBoardDisplay } from "@/components/providers/board-display-provider";
import { useT } from "@/lib/i18n";
import { resolveTimeControlType } from "@/lib/time-control";
import { GameActions } from "@/components/board/game-actions";
import { apiFetch } from "@/lib/api-fetch";
import { invalidateFetchCache } from "@/lib/fetch-cache";

const Chessboard = dynamic(
    () => import("react-chessboard").then((m) => m.Chessboard),
    {ssr: false, loading: () => <div className="w-full aspect-square bg-muted animate-pulse"></div> }
);

interface Props {
    game: ActiveGame;
    physicalBoard?: PhysicalBoard;
    showStatus?: boolean;
    isAdmin?: boolean;
}

export function GameCard({ game, physicalBoard, showStatus = true, isAdmin = false }: Props) {
  const router = useRouter();
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(0);
  const boardUrl = `/board?id=${encodeGameID(game.gameID)}`;
  const { boardColors } = useBoardDisplay();
  const { t } = useT();
  const timeControl = resolveTimeControlType(game.initialTimeMs, game.incrementMs, game.timeControlType);
  const timeControlLabel = {
    blitz: t("timeControl.blitz"),
    rapid: t("timeControl.rapid"),
    classical: t("timeControl.classical"),
  }[timeControl];
  const boardLabel = game.boardID?.trim();
  const boardNumber = game.boardNumber?.trim();
  const restart = async () => {
    const response = await apiFetch(`/games/${encodeURIComponent(game.gameID)}/restart`, { method: "POST" });
    if (!response.ok) throw new Error(`Restart failed with ${response.status}`);
    invalidateFetchCache("/games/current");
    invalidateFetchCache(`/games/${game.gameID}`);
  };
  const resign = async (resignSide: "white" | "black" | "draw", branchId: string | null) => {
    const response = await apiFetch(`/games/${encodeURIComponent(game.gameID)}/resign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resignSide, branchId }),
    });
    if (!response.ok) throw new Error(`Resign failed with ${response.status}`);
    invalidateFetchCache("/games/current");
    invalidateFetchCache("/games/history");
    invalidateFetchCache(`/games/${game.gameID}`);
  };
  const hasInitialPositionError = Boolean(
    physicalBoard?.missingSquares?.length
    || physicalBoard?.extraSquares?.length
    || physicalBoard?.wrongPieceSquares?.length,
  );
  // A live game's Mongo status remains "waiting" until the first move. The
  // physical-board initcheck is therefore the authoritative source for the
  // pre-game chip: it must win over that stale persistence status.
  const boardStatus = game.status === "playing"
    ? { label: t("home.boardPlaying"), className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" }
    : hasInitialPositionError || game.status === "scan_failed"
      ? { label: t("home.boardCheck"), className: "bg-destructive/10 text-destructive" }
      : physicalBoard?.initStatus === "ready"
        ? { label: t("home.boardReady"), className: "bg-sky-500/12 text-sky-700 dark:text-sky-300" }
        : physicalBoard?.initStatus === "waiting_button"
          ? { label: t("home.boardPressButton"), className: "bg-amber-500/12 text-amber-700 dark:text-amber-300" }
          : physicalBoard?.initStatus === "idle" || physicalBoard?.initStatus === "checkinit"
            ? { label: t("home.boardChecking"), className: "bg-muted text-muted-foreground" }
            : game.status === "ready" || game.status === "active"
              ? { label: t("home.boardReady"), className: "bg-sky-500/12 text-sky-700 dark:text-sky-300" }
              : game.status === "waiting_button"
                ? { label: t("home.boardPressButton"), className: "bg-amber-500/12 text-amber-700 dark:text-amber-300" }
                : game.status === "waiting" || game.status === "waiting_scan" || game.status === "checkinit" || game.status === "idle"
                  ? { label: t("home.boardChecking"), className: "bg-muted text-muted-foreground" }
                : { label: t("home.boardWaiting"), className: "bg-muted text-muted-foreground" };
  const initSquareStyles = useMemo<Record<string, React.CSSProperties>>(() => {
    const styles: Record<string, React.CSSProperties> = {};
    physicalBoard?.missingSquares?.forEach((square) => { styles[square] = { background: "rgba(255,0,0,0.55)" }; });
    physicalBoard?.extraSquares?.forEach((square) => { styles[square] = { background: "rgba(255,165,0,0.60)" }; });
    physicalBoard?.wrongPieceSquares?.forEach((item) => {
      const square = typeof item === "string" ? item : item.square;
      if (square) styles[square] = { background: "rgba(255,230,0,0.65)" };
    });
    return styles;
  }, [physicalBoard?.extraSquares, physicalBoard?.missingSquares, physicalBoard?.wrongPieceSquares]);

  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return;
    const update = () => setBoardWidth(Math.max(0, Math.floor(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the home mini-board neutral. Last-move highlighting remains enabled
  // on the full board and review pages where move navigation is available.
  // const squareStyles = useMemo<Record<string, React.CSSProperties>>(() => {
  //   if (!game.lastMove) return {};
  //   return {
  //     [game.lastMove.from]: { background: "rgba(236,243,116,0.75)" },
  //     [game.lastMove.to]: { background: "rgba(236,243,116,0.75)" },
  //   };
  // }, [game.lastMove]);

  return (
    <Link
      href={boardUrl}
      className="group flex flex-col bg-card rounded-lg border border-border overflow-hidden cursor-pointer transition-all duration-150 hover:border-border/80 hover:shadow-md hover:-translate-y-px"
      onMouseEnter={() => router.prefetch(boardUrl)}
      onFocus={() => router.prefetch(boardUrl)}
      aria-label={t("home.openGame", { players: `${game.whiteName} vs ${game.blackName}` })}
    >
      <div className="flex min-h-8 items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
        {boardNumber ? <span className="min-w-0 truncate text-xs font-semibold text-foreground">{t("common.boardNumber", { n: boardNumber })}</span> : <span />}
        {showStatus ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${boardStatus.className}`}>{boardStatus.label}</span> : null}
      </div>
      {/* Mini board */}
      <div ref={boardWrapRef} className="w-full aspect-square overflow-hidden">
        {boardWidth >= 80 ? (
          <Chessboard
            position={game.fen || "start"}
            arePiecesDraggable={false}
            customDarkSquareStyle={{ backgroundColor: boardColors.dark }}
            customLightSquareStyle={{ backgroundColor: boardColors.light }}
            customSquareStyles={initSquareStyles}
            boardWidth={boardWidth}
          />
        ) : (
          <div className="w-full h-full bg-muted animate-pulse" />
        )}
      </div>

      {/* Player names footer */}
      <div className="flex items-center gap-2 border-t border-border bg-card px-3 py-2">
        {/* White */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="size-2.5 rounded-full bg-[#f0f0f0] border border-black/15 shrink-0" />
          <span className="text-xs font-medium text-foreground truncate">{game.whiteName}</span>
        </div>
        <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider shrink-0">vs</span>
        {/* Black */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
          <span className="text-xs font-medium text-foreground truncate text-right">{game.blackName}</span>
          <span className="size-2.5 rounded-full bg-[#1a1a1a] border border-white/10 shrink-0" />
        </div>
      </div>
      <div className="border-t border-border/70 bg-muted/30 px-3 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 flex-1 justify-center whitespace-nowrap rounded-full border border-primary/35 bg-primary/12 px-2.5 py-1 text-[9px] font-semibold text-primary shadow-sm sm:text-[10px]">
            {timeControlLabel}
          </span>
          {boardLabel ? (
            <span className="inline-flex min-w-0 flex-1 justify-center truncate whitespace-nowrap rounded-full border border-accent/40 bg-accent/30 px-2.5 py-1 text-[9px] font-semibold text-accent-foreground shadow-sm sm:text-[10px]">
              {boardLabel}
            </span>
          ) : null}
        </div>
      </div>
      {isAdmin && (
        <div onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
          <GameActions
            gameID={game.gameID}
            onRestart={restart}
            onResign={resign}
            isAuthenticated
            compact
          />
        </div>
      )}
    </Link>
  );
}
