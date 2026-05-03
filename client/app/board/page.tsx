"use client";

import { useState, useCallback, Suspense, useEffect, useRef, type CSSProperties } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { decodeGameID } from "@/lib/id-utils";
import { useGame, type BoardAlert } from "@/hooks/use-game";
import { useGameStore } from "@/lib/store";
import { ChessBoardView } from "@/components/board/chess-board-view";
import { EvalBar } from "@/components/board/eval-bar";
import { GamePanel, type GamePanelHandle } from "@/components/board/game-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, WifiOff, X, Home, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function BoardSkeleton() {
  return (
    <div className="p-2 sm:p-3 sm:h-[calc(100vh-var(--header-h))]">
      <div className="max-w-[1600px] mx-auto sm:h-full">
        <div className="
          grid grid-cols-1 gap-2 items-start
          sm:gap-3 sm:h-full sm:items-stretch
          sm:grid-cols-[minmax(0,1fr)_clamp(200px,28vw,260px)]
          lg:grid-cols-[minmax(0,1fr)_18px_clamp(260px,22vw,320px)]
        ">
          <div className="flex flex-col gap-2 sm:h-full sm:min-h-0">
            <Skeleton className="w-full aspect-square sm:aspect-auto sm:flex-1" />
            <Skeleton className="h-3.5 lg:hidden" />
          </div>
          <Skeleton className="hidden lg:block w-5 h-full" />
          <div className="flex flex-col gap-2 sm:h-full">
            <Skeleton className="h-9" />
            <Skeleton className="h-16" />
            <Skeleton className="h-[clamp(180px,35vh,280px)] sm:flex-1 sm:h-auto" />
            <Skeleton className="h-9" />
            <Skeleton className="h-12" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Scan state overlay ────────────────────────────────────────────────────────
interface ScanStateViewProps {
  status: "waiting_scan" | "scan_failed";
  whiteName: string;
  blackName: string;
  scanMissing: string[];
  scanReason: "MISSING" | "DUPLICATE" | null;
  onRescan: () => void;
  rescanLoading: boolean;
}

function ScanStateView({
  status, whiteName, blackName, scanMissing, scanReason, onRescan, rescanLoading,
}: ScanStateViewProps) {
  const { t } = useT();
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(0);

  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return;
    const measure = () => setBoardWidth(Math.min(el.clientWidth, 480));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build red highlight styles for missing squares
  const highlightSquares: Record<string, CSSProperties> = {};
  if (status === "scan_failed" && scanReason === "MISSING") {
    for (const sq of scanMissing) {
      highlightSquares[sq] = { background: "rgba(239,68,68,0.55)" };
    }
  }

  const isFailed = status === "scan_failed";

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-h))] p-4 sm:p-6">
      <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6 lg:gap-8 w-full max-w-[860px]">

        {/* ── Chessboard ───────────────────────────────────── */}
        <div
          ref={boardWrapRef}
          className={cn(
            "w-full max-w-[480px] shrink-0 rounded overflow-hidden transition-shadow duration-300",
            !isFailed && "ring-2 ring-blue-500/40 shadow-[0_0_20px_2px_rgba(59,130,246,0.15)]",
             isFailed && "ring-2 ring-red-500/30",
          )}
        >
          {boardWidth >= 80 ? (
            <ChessBoardView
              fen={STARTING_FEN}
              lastMove={null}
              boardWidth={boardWidth}
              highlightSquares={highlightSquares}
            />
          ) : (
            <div className="w-full aspect-square bg-muted animate-pulse" />
          )}
        </div>

        {/* ── Status panel ─────────────────────────────────── */}
        <div className="flex flex-col gap-5 lg:pt-3 items-center lg:items-start text-center lg:text-left w-full max-w-[320px]">

          {/* Player names */}
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#f0f0f0] border border-black/15 shrink-0" />
              {whiteName}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50">vs</span>
            <span className="flex items-center gap-1.5">
              {blackName}
              <span className="size-2.5 rounded-full bg-[#1a1a1a] border border-white/10 shrink-0" />
            </span>
          </div>

          {/* Status icon + title */}
          {!isFailed ? (
            <div className="flex flex-col items-center lg:items-start gap-3">
              <div className="size-14 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Loader2 className="size-7 text-blue-500 animate-spin" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold">{t("board.waitingScan")}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{t("board.waitingScanHint")}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center lg:items-start gap-3 w-full">
              <div className="size-14 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="size-7 text-red-500" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold">{t("board.scanFailed")}</h2>
                {scanReason === "DUPLICATE" ? (
                  <p className="text-sm text-muted-foreground">{t("board.scanDuplicate")}</p>
                ) : scanMissing.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">{t("board.scanMissingHint")}</p>
                    <div className="flex flex-wrap gap-1.5 justify-center lg:justify-start">
                      {scanMissing.map((sq) => (
                        <span
                          key={sq}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                        >
                          {sq}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("board.scanFailedHint")}</p>
                )}
              </div>

              <Button onClick={onRescan} disabled={rescanLoading} className="min-w-[120px] mt-1">
                {rescanLoading
                  ? <><Loader2 className="size-3.5 mr-2 animate-spin" />{t("board.scanning")}</>
                  : t("board.rescan")
                }
              </Button>
            </div>
          )}

          {/* Legend for missing squares */}
          {isFailed && scanReason === "MISSING" && scanMissing.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-3 rounded-sm bg-red-500/50 shrink-0" />
              <span>{t("board.scanLegendMissing")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Game ended overlay ────────────────────────────────────────────────────────
interface GameEndedViewProps {
  result: string | null;
  whiteName: string;
  blackName: string;
  fen: string;
}

function GameEndedView({ result, whiteName, blackName, fen }: GameEndedViewProps) {
  const { t } = useT();
  const router = useRouter();
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(0);

  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return;
    const measure = () => setBoardWidth(Math.min(el.clientWidth, 480));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isDraw    = result === "1/2-1/2";
  const whiteWins = result === "1-0";
  const blackWins = result === "0-1";
  const hasResult = isDraw || whiteWins || blackWins;

  const resultLabel = isDraw
    ? t("result.draw")
    : whiteWins
    ? t("result.whiteWin")
    : blackWins
    ? t("result.blackWin")
    : t("board.gameEnded");

  const winnerName = isDraw ? null : whiteWins ? whiteName : blackName;
  const loserName  = isDraw ? null : whiteWins ? blackName : whiteName;

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-h))] p-4 sm:p-6">
      <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6 lg:gap-8 w-full max-w-[860px]">

        {/* ── Chessboard (final position) ───────────────────── */}
        <div
          ref={boardWrapRef}
          className="w-full max-w-[480px] shrink-0 rounded overflow-hidden ring-2 ring-border/40"
        >
          {boardWidth >= 80 ? (
            <ChessBoardView fen={fen} lastMove={null} boardWidth={boardWidth} />
          ) : (
            <div className="w-full aspect-square bg-muted animate-pulse" />
          )}
        </div>

        {/* ── Result panel ──────────────────────────────────── */}
        <div className="flex flex-col gap-5 lg:pt-3 items-center lg:items-start text-center lg:text-left w-full max-w-[320px]">

          {/* Player names */}
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#f0f0f0] border border-black/15 shrink-0" />
              {whiteName}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50">vs</span>
            <span className="flex items-center gap-1.5">
              {blackName}
              <span className="size-2.5 rounded-full bg-[#1a1a1a] border border-white/10 shrink-0" />
            </span>
          </div>

          {/* Result */}
          <div className="flex flex-col items-center lg:items-start gap-3">
            <div className={cn(
              "size-14 rounded-full flex items-center justify-center",
              isDraw ? "bg-yellow-500/10" : "bg-green-500/10"
            )}>
              <Trophy className={cn("size-7", isDraw ? "text-yellow-500" : "text-green-500")} />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold">{t("board.gameEnded")}</h2>
              {hasResult && (
                <p className="text-sm font-medium">{result} — {resultLabel}</p>
              )}
              {isDraw ? (
                <p className="text-xs text-muted-foreground">{t("board.drawAgreed")}</p>
              ) : hasResult && winnerName && loserName ? (
                <p className="text-xs text-muted-foreground">{t("board.resignedBy")}</p>
              ) : null}
            </div>
            {!isDraw && winnerName && loserName && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="size-2.5 rounded-full bg-green-500/80 shrink-0" />
                  <span className="font-medium">{winnerName}</span>
                  <span className="text-muted-foreground">{t("board.winner")}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-2.5 rounded-full bg-red-500/60 shrink-0" />
                  <span className="font-medium text-foreground">{loserName}</span>
                  <span>{t("board.resignedBy")}</span>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/"><Home className="size-3.5 mr-1.5" />{t("nav.home")}</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/played">{t("board.viewHistory")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Board offline banner ──────────────────────────────────────────────────────
function BoardOfflineBanner() {
  const { t } = useT();
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium">
      <WifiOff className="size-3.5 shrink-0" />
      <span>{t("board.boardOffline")}</span>
    </div>
  );
}

// ── In-game alert toast ───────────────────────────────────────────────────────
function AlertToast({ alert, onDismiss }: { alert: BoardAlert; onDismiss: () => void }) {
  const { t } = useT();
  const labelKey = `board.alert.${alert.code.toLowerCase()}` as any;

  const color: Record<string, string> = {
    PIECE_LOST:       "border-red-700 bg-red-600 text-white",
    WRONG_TURN:       "border-orange-600 bg-orange-500 text-white",
    ILLEGAL_DEST:     "border-orange-600 bg-orange-500 text-white",
    FALLBACK_TIMEOUT: "border-yellow-600 bg-yellow-500 text-white",
    TRACK_TIMEOUT:    "border-yellow-600 bg-yellow-500 text-white",
    LIFT_GLITCH:      "border-yellow-600 bg-yellow-500 text-white",
  };

  const cls = color[alert.code] ?? "border-red-700 bg-red-600 text-white";

  // Try translation key, fall back to raw code
  const label = t(labelKey) !== labelKey ? t(labelKey) : alert.code.replace(/_/g, " ");
  const detail = alert.detail || "";

  return (
    <div className={cn(
      "fixed top-[70px] left-1/2 -translate-x-1/2 z-50",
      "flex items-start gap-2 px-3 py-2 rounded-lg border shadow-lg",
      "max-w-[90vw] sm:max-w-sm text-xs font-medium",
      cls
    )}>
      <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
      <span className="flex-1 min-w-0">
        {label}{detail ? `: ${detail}` : ""}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

// ── Main board content ─────────────────────────────────────────────────────────
function BoardContent() {
  const searchParams = useSearchParams();
  const rawID  = searchParams.get("id") ?? "";
  const gameID = rawID ? decodeGameID(rawID) : "";

  const clearPhysicalBoardGameID = useGameStore((s) => s.clearPhysicalBoardGameID);

  const {
    fen, pgn, cp, whiteName, blackName, lastMove,
    boardConnected, boardOffline, activeAlert, dismissAlert,
    status, result, scanMissing, scanReason,
    isLoaded, notFound, restart, resign, rescan, rescanLoading,
    lastMoveAt, moveTimesMap,
  } = useGame(gameID);

  const { t } = useT();
  const [navFen, setNavFen] = useState<string | null>(null);
  const displayFen = navFen ?? fen;
  const boardWrapRef  = useRef<HTMLDivElement | null>(null);
  const gamePanelRef  = useRef<GamePanelHandle | null>(null);
  const [boardWidth, setBoardWidth] = useState(0);

  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.floor(rect.width);
      // Use measured height when available; fall back conservatively (80 px
      // accounts for padding + optional eval-bar row below the board).
      const h = rect.height > 50
        ? Math.floor(rect.height)
        : Math.floor(window.innerHeight - rect.top - 80);
      const next = Math.max(200, Math.min(w, h) - 4);
      setBoardWidth(next);
    };
    measure();
    requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  // status is included so the effect re-runs when the board transitions from
  // ScanStateView → main board (boardWrapRef goes from null → mounted element).
  }, [isLoaded, status]);

  const handleNavigate = useCallback((f: string | null) => setNavFen(f), []);

  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) gamePanelRef.current?.goNext();
      else              gamePanelRef.current?.goBack();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isLoaded, status]);

  if (!gameID) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-var(--header-h))] text-sm text-muted-foreground">
        {t("board.gameMissing")}
      </div>
    );
  }

  if (!isLoaded) return <BoardSkeleton />;

  if (notFound) {
    // Clear any stale physical-board link so the home-page card reverts to "Ready"
    if (gameID) clearPhysicalBoardGameID(gameID);
    return (
      <div className="flex items-center justify-center h-[calc(100vh-var(--header-h))]">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-muted-foreground">{t("board.gameNotFound")}</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/"><Home className="size-3.5 mr-1.5" />{t("nav.home")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  // ── Game ended overlay ───────────────────────────────────────────────────────
  if (status === "ended") {
    return (
      <GameEndedView
        result={result}
        whiteName={whiteName}
        blackName={blackName}
        fen={fen}
      />
    );
  }

  // ── Scan state overlays ──────────────────────────────────────────────────────
  if (status === "waiting_scan" || status === "scan_failed") {
    return (
      <ScanStateView
        status={status}
        whiteName={whiteName}
        blackName={blackName}
        scanMissing={scanMissing}
        scanReason={scanReason}
        onRescan={rescan}
        rescanLoading={rescanLoading}
      />
    );
  }

  return (
    /* Outer shell owns the full page height so the offline banner shrinks the
       board area rather than overflowing the viewport. */
    <div className="flex flex-col sm:h-[calc(100vh-var(--header-h))]">
      {/* Board offline banner — in-flow; takes height from the board area */}
      {boardOffline && <BoardOfflineBanner />}

      {/* Alert toast — fixed position, does not affect flow */}
      {activeAlert && <AlertToast alert={activeAlert} onDismiss={dismissAlert} />}

      <div className="flex-1 min-h-0 p-2 sm:p-3">
        <div className="max-w-[1600px] mx-auto sm:h-full">
          <div className="
            grid grid-cols-1 gap-2 items-start
            sm:gap-3 sm:h-full sm:items-stretch
            sm:grid-cols-[minmax(0,1fr)_clamp(200px,28vw,260px)]
            lg:grid-cols-[minmax(0,1fr)_18px_clamp(260px,22vw,320px)]
          ">

            {/* ── Left column: board + horizontal eval bar ─────── */}
            <div className="flex flex-col gap-2 sm:h-full sm:min-h-0">
              <div
                ref={boardWrapRef}
                className="
                  w-full min-w-0 aspect-square
                  flex items-center justify-center
                  sm:aspect-auto sm:flex-1 sm:min-h-0
                "
              >
                <ChessBoardView
                  fen={displayFen}
                  lastMove={navFen ? null : lastMove}
                  boardWidth={boardWidth}
                />
              </div>

              {(() => {
                const liveWhiteTurn = status === "playing" && !fen.includes(" b ");
                const liveBlackTurn = status === "playing" &&  fen.includes(" b ");
                return (
                  <div className="lg:hidden flex items-center gap-2">
                    <div className="flex items-center gap-1.5 shrink-0 w-[clamp(56px,18%,110px)] min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#1a1a1a] border border-white/20 dark:border-white/10 shrink-0" />
                      <span className={`text-[11px] font-medium leading-none truncate transition-colors ${
                        liveBlackTurn ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                      }`}>{blackName}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <EvalBar cp={cp} orientation="horizontal" />
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 w-[clamp(56px,18%,110px)] min-w-0 justify-end">
                      <span className={`text-[11px] font-medium leading-none truncate text-right transition-colors ${
                        liveWhiteTurn ? "text-green-700 dark:text-green-400" : "text-muted-foreground"
                      }`}>{whiteName}</span>
                      <div className="w-2.5 h-2.5 rounded-full bg-[#f0f0f0] border border-black/10 shrink-0" />
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ── Vertical eval bar — lg+ only ──────────────────── */}
            <div className="hidden lg:flex lg:items-center lg:h-full">
              <EvalBar cp={cp} />
            </div>

            {/* ── Game panel ────────────────────────────────────── */}
            <div className="sm:h-full">
              <GamePanel
                ref={gamePanelRef}
                gameID={gameID}
                whiteName={whiteName}
                blackName={blackName}
                pgn={pgn}
                boardConnected={boardConnected}
                status={status}
                lastMoveAt={lastMoveAt}
                moveTimesMap={moveTimesMap}
                onRestart={restart}
                onResign={resign}
                onNavigate={handleNavigate}
              />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default function BoardPage() {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <BoardContent />
    </Suspense>
  );
}
