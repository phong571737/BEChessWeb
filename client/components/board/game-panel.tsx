"use client";

import { useState, useMemo, useCallback, useEffect, memo, forwardRef, useImperativeHandle } from "react";
import { Chess } from "chess.js";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Wifi,
  WifiOff,
  Copy,
  Check,
  List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PGNTable } from "./pgn-table";
import { GameActions } from "./game-actions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/** Format milliseconds → "S.t" | "SS.t" | "M:SS.t" */
function fmtMs(ms: number): string {
  const tenths   = Math.floor(ms / 100) % 10;
  const totalSec = Math.floor(ms / 1000);
  const sec      = totalSec % 60;
  const min      = Math.floor(totalSec / 60);
  if (min > 0) return `${min}:${String(sec).padStart(2, "0")}.${tenths}`;
  return `${sec}.${tenths}`;
}

/**
 * Isolated clock — ticks every 100ms.
 * Tách riêng để chỉ mình nó re-render, không kéo GamePanel theo.
 */
const ThinkingClock = memo(function ThinkingClock({
  lastMoveAt,
  color,
}: {
  lastMoveAt: number;
  color: "white" | "black";
}) {
  const [thinkMs, setThinkMs] = useState(() => Date.now() - lastMoveAt);

  useEffect(() => {
    const tick = () => setThinkMs(Date.now() - lastMoveAt);
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [lastMoveAt]);

  return (
    <span className={cn(
      "text-[11px] font-mono tabular-nums shrink-0 leading-none",
      color === "black" ? "text-red-500 dark:text-red-400" : "text-green-600 dark:text-green-400"
    )}>
      {fmtMs(thinkMs)}
    </span>
  );
});

interface Props {
  gameID:         string;
  whiteName:      string;
  blackName:      string;
  fen:            string;
  pgn:            string;
  /** Raw FEN list from server (fallback when PGN can't be built) */
  fenHistory:     string[] | null;
  boardConnected: boolean;
  status:         string;
  /** Timestamp of the last move — drives the live thinking clock */
  lastMoveAt:     number;
  /** 0-based ply → elapsed ms (only live moves have an entry) */
  moveTimesMap:   Record<number, number>;
  onRestart:      () => Promise<void>;
  onResign:       (resignSide: "white" | "black" | "draw") => Promise<void>;
  onNavigate:     (fen: string | null) => void;
}

export interface GamePanelHandle {
  goBack:  () => void;
  goNext:  () => void;
  goStart: () => void;
  goEnd:   () => void;
}

export const GamePanel = forwardRef<GamePanelHandle, Props>(function GamePanel({
  gameID,
  whiteName,
  blackName,
  fen,
  pgn,
  fenHistory: fenHistoryProp,
  boardConnected,
  status,
  lastMoveAt,
  moveTimesMap,
  onRestart,
  onResign,
  onNavigate,
}, ref) {
  const { t } = useT();
  const [cursor, setCursor] = useState(-1);
  const [copied, setCopied] = useState(false);
  const [notationMode, setNotationMode] = useState<"pgn" | "fen">("pgn");

  // Auto-switch to FEN mode when PGN is empty but fenHistory exists
  useEffect(() => {
    if (!pgn?.trim() && fenHistoryProp?.length) {
      setNotationMode("fen");
    }
  }, [pgn, fenHistoryProp]);

  // Build FEN history from PGN, falling back to raw fenHistory prop
  const fenHistory = useMemo(() => {
    if (pgn?.trim()) {
      try {
        const c   = new Chess();
        const tmp = new Chess();
        c.loadPgn(pgn);
        const hist = c.history();
        const fens: string[] = ["start"];
        for (const m of hist) { tmp.move(m); fens.push(tmp.fen()); }
        return fens;
      } catch { /* fall through to fenHistoryProp */ }
    }
    if (fenHistoryProp && fenHistoryProp.length > 0) {
      return ["start", ...fenHistoryProp];
    }
    return [];
  }, [pgn, fenHistoryProp]);

  const totalMoves   = Math.max(0, fenHistory.length - 1);
  const activeCursor = cursor === -1 ? totalMoves : cursor;
  // Determine turn from current FEN (more reliable than deriving from PGN,
  // since physical-board FENs may not form a valid chess game).
  const currentFen   = cursor === -1 ? fen : (fenHistory[activeCursor] ?? fen);
  const isWhiteTurn  = !/ b /.test(currentFen);
  const isPlaying    = status === "playing";

  const goTo = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(totalMoves, idx));
      setCursor(clamped === totalMoves ? -1 : clamped);
      onNavigate(clamped === totalMoves ? null : fenHistory[clamped] ?? "start");
    },
    [fenHistory, totalMoves, onNavigate]
  );

  const goStart = useCallback(() => goTo(0),                [goTo]);
  const goBack  = useCallback(() => goTo(activeCursor - 1), [goTo, activeCursor]);
  const goNext  = useCallback(() => goTo(activeCursor + 1), [goTo, activeCursor]);
  const goEnd   = useCallback(() => goTo(totalMoves),       [goTo, totalMoves]);

  // Expose navigation to parent (for wheel-on-board)
  useImperativeHandle(ref, () => ({ goBack, goNext, goStart, goEnd }), [goBack, goNext, goStart, goEnd]);

  // Keyboard navigation: ← → prev/next, Home/End first/last
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "ArrowLeft")  { e.preventDefault(); goBack(); }
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      if (e.key === "Home")       { e.preventDefault(); goStart(); }
      if (e.key === "End")        { e.preventDefault(); goEnd(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goBack, goNext, goStart, goEnd]);

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div className="flex flex-col min-h-0 sm:h-full border border-border rounded-sm bg-card overflow-hidden">

      {/* ── Header: game ID + connection + copy ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <div className={cn(
          "w-2 h-2 rounded-full shrink-0 transition-colors",
          boardConnected
            ? "bg-green-500 shadow-[0_0_6px_1px_rgba(34,197,94,0.55)]"
            : "bg-muted-foreground/30"
        )} />
        <span className="text-xs text-muted-foreground font-mono truncate flex-1 min-w-0">
          {gameID}
        </span>
        {boardConnected
          ? <Wifi    className="h-3 w-3 text-green-600 dark:text-green-400 shrink-0" />
          : <WifiOff className="h-3 w-3 text-muted-foreground/50 shrink-0" />
        }
        <button
          type="button"
          onClick={onCopyLink}
          title={t("board.copyLink")}
          aria-label={t("board.copyLink")}
          className="h-6 w-6 rounded-sm hover:bg-accent flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied
            ? <Check className="h-3 w-3 text-green-500" />
            : <Copy  className="h-3 w-3" />}
        </button>
      </div>

      {/* ── Players with turn indicator + live clock ── */}
      <div className="border-b border-border">

        {/* Black player — red border + bg when it's black's turn */}
        <div className={cn(
          "flex items-center gap-2.5 px-3 py-[7px] transition-all duration-200 border-l-[3px]",
          !isWhiteTurn && isPlaying
            ? "border-red-500 bg-red-500/10"
            : "border-transparent"
        )}>
          <div className="w-3.5 h-3.5 rounded-full bg-[#1a1a1a] border border-white/20 shrink-0 dark:border-white/10" />
          <span className={cn(
            "text-xs font-medium truncate flex-1 min-w-0 transition-colors",
            !isWhiteTurn && isPlaying ? "text-red-600 dark:text-red-400" : ""
          )}>
            {blackName}
          </span>
          {!isWhiteTurn && isPlaying && (
            <>
              <ThinkingClock lastMoveAt={lastMoveAt} color="black" />
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            </>
          )}
        </div>

        {/* White player — green border + bg when it's white's turn */}
        <div className={cn(
          "flex items-center gap-2.5 px-3 py-[7px] transition-all duration-200 border-l-[3px]",
          isWhiteTurn && isPlaying
            ? "border-green-500 bg-green-500/10"
            : "border-transparent"
        )}>
          <div className="w-3.5 h-3.5 rounded-full bg-[#f0f0f0] border border-black/15 shrink-0" />
          <span className={cn(
            "text-xs font-medium truncate flex-1 min-w-0 transition-colors",
            isWhiteTurn && isPlaying ? "text-green-700 dark:text-green-400" : ""
          )}>
            {whiteName}
          </span>
          {isWhiteTurn && isPlaying && (
            <>
              <ThinkingClock lastMoveAt={lastMoveAt} color="white" />
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
            </>
          )}
        </div>
      </div>

      {/* ── FEN display ── */}
      <div className="border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">FEN</span>
          <code className="flex-1 min-w-0 truncate text-[10px] font-mono text-muted-foreground/80">{fen || "-"}</code>
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(fen || ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors"
            title="Copy FEN"
            aria-label="Copy FEN"
          >
            {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
          </button>
        </div>
      </div>

      {/* ── PGN/FEN list ── */}
      <div className="border-b border-border px-2 py-1">
        {!pgn?.trim() && !!fenHistoryProp?.length && (
          <div className="text-[10px] text-amber-600 dark:text-amber-400 mb-1 leading-tight">
            PGN unavailable, using FEN timeline
          </div>
        )}
        <div className="inline-flex rounded-md border border-border overflow-hidden bg-muted/40">
          <button
            type="button"
            onClick={() => setNotationMode("pgn")}
            className={cn("px-2.5 py-1 text-xs font-medium", notationMode === "pgn" ? "bg-accent text-foreground" : "text-muted-foreground")}
          >
            PGN
          </button>
          <button
            type="button"
            onClick={() => setNotationMode("fen")}
            className={cn("px-2.5 py-1 text-xs font-medium", notationMode === "fen" ? "bg-accent text-foreground" : "text-muted-foreground")}
          >
            FEN
          </button>
        </div>
      </div>

      <div className="flex flex-col h-[clamp(180px,35vh,280px)] sm:h-auto sm:flex-1 sm:min-h-0">
        {notationMode === "pgn" ? (
          <PGNTable
            pgn={pgn}
            cursor={cursor === -1 ? totalMoves : cursor}
            moveTimesMap={moveTimesMap}
            onGoTo={(idx) => goTo(idx)}
          />
        ) : (
          <ScrollArea className="flex-1 min-h-0 h-full">
            <div className="p-1.5 space-y-1">
              {fenHistory.map((fenAt, idx) => {
                const isActive = activeCursor === idx;
                return (
                  <button
                    key={`fen-${idx}`}
                    type="button"
                    onClick={() => goTo(idx)}
                    className={cn(
                      "w-full text-left px-2 py-1 rounded-sm border transition-colors",
                      isActive ? "bg-accent border-accent" : "border-border hover:bg-accent/50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-mono shrink-0">{idx}</span>
                      <span className="text-xs text-muted-foreground truncate flex-1 text-right">{fenAt}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* ── Navigation controls ── */}
      <div className="flex items-center justify-between px-2 py-1.5 border-t border-border">
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goStart} disabled={activeCursor === 0}>
            <ChevronsLeft  className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack}  disabled={activeCursor === 0}>
            <ChevronLeft   className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext}  disabled={activeCursor === totalMoves}>
            <ChevronRight  className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goEnd}   disabled={activeCursor === totalMoves}>
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground font-mono tabular-nums pr-1 select-none">
          {activeCursor}/{totalMoves}
        </span>
      </div>

      {/* ── Game actions ── */}
      <GameActions
        gameID={gameID}
        onRestart={onRestart}
        onResign={onResign}
      />
    </div>
  );
});
