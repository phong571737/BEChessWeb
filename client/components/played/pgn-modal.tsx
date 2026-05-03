"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Clock, Hash, Trophy, Calendar, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { Chess } from "chess.js";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ChessBoardView } from "@/components/board/chess-board-view";
import { resultVariant, formatDateTime, formatDuration } from "@/lib/game-utils";
import { useT } from "@/lib/i18n";
import type { HistoryGame } from "@/types/game.types";

interface Props {
  game:    HistoryGame | null;
  onClose: () => void;
}

interface ReviewProps {
  game: HistoryGame;
}

function movesOnly(pgn: string): string {
  return pgn.replace(/\[[^\]]+\]\s*/g, "").trim();
}

export function PGNReviewContent({ game }: ReviewProps) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(360);
  const lastWheelTsRef = useRef(0);

  const timeline = useMemo(() => {
    if (!game) return [{ fen: "start", san: "start", lastMove: null as { from: string; to: string } | null }];
    try {
      const c = new Chess();
      c.loadPgn(game.pgn);
      const sans = c.history();
      const temp = new Chess();
      const out: Array<{ fen: string; san: string; lastMove: { from: string; to: string } | null }> = [
        { fen: temp.fen(), san: "start", lastMove: null },
      ];
      for (const san of sans) {
        const mv = temp.move(san);
        out.push({
          fen: temp.fen(),
          san,
          lastMove: mv ? { from: mv.from, to: mv.to } : null,
        });
      }
      return out;
    } catch {
      return [{ fen: "start", san: "start", lastMove: null }];
    }
  }, [game]);

  const currentIndex = cursor === -1 ? timeline.length - 1 : Math.max(0, Math.min(cursor, timeline.length - 1));
  const current = timeline[currentIndex];

  useEffect(() => {
    setCursor(-1);
  }, [game?._id]);

  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return;

    const measure = () => {
      const w = Math.floor(el.clientWidth);
      if (w > 0) setBoardWidth(Math.max(240, Math.min(560, w)));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const playNavSound = (forward: boolean) => {
    if (typeof window === "undefined") return;
    const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = forward ? 880 : 720;
    gain.gain.value = 0.03;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.03, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc.start(now);
    osc.stop(now + 0.07);
    osc.onended = () => {
      ctx.close().catch(() => {});
    };
  };

  const goTo = useCallback((idx: number, withSound = true) => {
    const clamped = Math.max(0, Math.min(idx, timeline.length - 1));
    if (clamped === currentIndex) return;
    if (withSound) playNavSound(clamped > currentIndex);
    setCursor(clamped === timeline.length - 1 ? -1 : clamped);
  }, [currentIndex, timeline.length]);

  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastWheelTsRef.current < 90) return;
      lastWheelTsRef.current = now;
      if (e.deltaY > 0) goTo(currentIndex + 1);
      else if (e.deltaY < 0) goTo(currentIndex - 1);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [currentIndex, goTo]);

  const copyPGN = async () => {
    try {
      await navigator.clipboard.writeText(game.pgn);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <>
        <div className="flex flex-col gap-1.5 p-4 sm:p-5 border-b border-border bg-card">
          <div className="flex items-center gap-2 flex-wrap pr-8">
            <h2 className="text-base sm:text-lg font-semibold leading-none tracking-tight">
              {game.White} vs {game.Black}
            </h2>
            <Badge variant={resultVariant(game.Result)} className="w-24 justify-center shrink-0">
              {game.Result === "1-0" ? t("result.whiteWin") : game.Result === "0-1" ? t("result.blackWin") : game.Result === "1/2-1/2" ? t("result.draw") : game.Result}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(game.createAt || game.endedAt || game.Date)}
          </p>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 px-4 sm:px-5 pt-4">
          <div className="rounded-sm border border-border bg-muted p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Clock className="h-3 w-3" />
              {t("rev.duration")}
            </div>
            <span className="text-sm font-medium font-mono">{formatDuration(game.durationSec)}</span>
          </div>
          <div className="rounded-sm border border-border bg-muted p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Hash className="h-3 w-3" />
              {t("rev.moves")}
            </div>
            <span className="text-sm font-medium">{game.totalMoves}</span>
          </div>
          <div className="rounded-sm border border-border bg-muted p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Trophy className="h-3 w-3" />
              {t("rev.result")}
            </div>
            <span className="text-sm font-medium">{game.Result}</span>
          </div>
          <div className="rounded-sm border border-border bg-muted p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Calendar className="h-3 w-3" />
              {t("rev.started")}
            </div>
            <span className="text-sm font-medium">{formatDateTime(game.createAt || game.Date)}</span>
          </div>
        </div>

        <div className="px-4 sm:px-5 py-3">
          <Separator />
        </div>

        {/* Review board */}
        <div className="px-4 sm:px-5 pb-3 space-y-2">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,520px)_1fr] gap-3">
            <div
              ref={boardWrapRef}
              className="w-full max-w-[560px] select-none overscroll-contain"
              title="Mouse wheel: scroll up/down to navigate moves"
            >
              <ChessBoardView fen={current.fen} lastMove={current.lastMove} boardWidth={boardWidth} />
            </div>
            <div className="rounded-sm border border-border bg-muted/50 min-h-[200px] flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">{t("rev.moveReview")}</span>
                <span className="text-xs font-mono text-muted-foreground">{currentIndex}/{timeline.length - 1}</span>
              </div>
              <ScrollArea className="h-[160px]">
                <div className="p-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {timeline.slice(1).map((m, i) => (
                    <button
                      key={`${m.san}-${i}`}
                      type="button"
                      onClick={() => goTo(i + 1)}
                      className={`text-left px-2 py-1 rounded-sm text-xs border ${
                        currentIndex === i + 1
                          ? "bg-accent border-border text-foreground"
                          : "border-transparent hover:bg-accent/70 text-muted-foreground"
                      }`}
                    >
                      {i + 1}. {m.san}
                    </button>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex items-center justify-center gap-1 p-2 border-t border-border">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => goTo(0)} disabled={currentIndex === 0}>
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => goTo(currentIndex + 1)} disabled={currentIndex >= timeline.length - 1}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => goTo(timeline.length - 1)} disabled={currentIndex >= timeline.length - 1}>
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* PGN section */}
        <div className="px-4 sm:px-5 pb-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("rev.pgnNotation")}</span>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={copyPGN}>
              {copied
                ? <><Check className="h-3 w-3" />{t("rev.copiedPgn")}</>
                : <><Copy className="h-3 w-3" />{t("rev.copyPgn")}</>
              }
            </Button>
          </div>

          {/* Moves only */}
          <ScrollArea className="h-36 rounded-sm border border-border bg-muted">
            <pre className="p-3 font-mono text-xs text-foreground whitespace-pre-wrap break-words">
              {movesOnly(game.pgn)}
            </pre>
          </ScrollArea>

          {/* Full PGN collapsible */}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium select-none">
              {t("rev.showFullPgn")}
            </summary>
            <ScrollArea className="mt-2 h-44 rounded-sm border border-border bg-muted">
              <pre className="p-3 font-mono text-xs text-foreground whitespace-pre-wrap break-words">
                {game.pgn}
              </pre>
            </ScrollArea>
          </details>
        </div>
    </>
  );
}

export function PGNModal({ game, onClose }: Props) {
  if (!game) return null;
  return (
    <Dialog open={!!game} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <PGNReviewContent game={game} />
      </DialogContent>
    </Dialog>
  );
}
