"use client";

import { useMemo, useRef, useEffect } from "react";
import { Chess } from "chess.js";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/** Format ms → compact clock string shown beside each move */
function fmtMoveTime(ms: number): string {
  const tenths   = Math.floor(ms / 100) % 10;
  const totalSec = Math.floor(ms / 1000);
  const sec      = totalSec % 60;
  const min      = Math.floor(totalSec / 60);
  if (min > 0) return `${min}:${String(sec).padStart(2, "0")}.${tenths}`;
  return `${sec}.${tenths}`;
}

interface MovePair {
  num:   number;
  white: string;
  black: string | undefined;
  /** Cursor index AFTER white's move (= i+1 in 0-based ply) */
  wi:    number;
  /** Cursor index AFTER black's move (= i+2) */
  bi:    number;
  /** 0-based ply index of white's move — key into moveTimesMap */
  wPly:  number;
  /** 0-based ply index of black's move */
  bPly:  number;
}

interface Props {
  pgn:          string;
  /** 0 = initial position, n = after n-th half-move */
  cursor:       number;
  /** 0-based ply → elapsed ms for that move (from useGame) */
  moveTimesMap?: Record<number, number>;
  onGoTo:       (idx: number) => void;
}

export function PGNTable({ pgn, cursor, moveTimesMap, onGoTo }: Props) {
  const { t } = useT();
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const endRef    = useRef<HTMLDivElement>(null);

  const pairs = useMemo((): MovePair[] => {
    if (!pgn?.trim()) return [];
    try {
      const c = new Chess();
      c.loadPgn(pgn);
      const hist = c.history();
      return Array.from({ length: Math.ceil(hist.length / 2) }, (_, pairIdx) => {
        const i = pairIdx * 2;
        return {
          num:   pairIdx + 1,
          white: hist[i],
          black: hist[i + 1],
          wi:    i + 1,
          bi:    i + 2,
          wPly:  i,
          bPly:  i + 1,
        };
      });
    } catch {
      return [];
    }
  }, [pgn]);

  // Scroll active move into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [cursor]);

  // Keep scrolled to bottom in live mode
  useEffect(() => {
    const lastPair = pairs[pairs.length - 1];
    if (!lastPair) return;
    const lastIdx = lastPair.black ? lastPair.bi : lastPair.wi;
    if (cursor === lastIdx) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs.length, cursor]);

  if (pairs.length === 0) {
    return (
      <ScrollArea className="flex-1 min-h-0 h-full">
        <div className="min-h-full flex items-center justify-center text-xs text-muted-foreground py-6">
          {t("board.noMoves")}
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="flex-1 min-h-0 h-full">
      <div className="p-1.5">
        {pairs.map(({ num, white, black, wi, bi, wPly, bPly }) => {
          const wTime = moveTimesMap?.[wPly];
          const bTime = moveTimesMap?.[bPly];

          return (
            <div
              key={num}
              className="grid grid-cols-[26px_1fr_1fr] items-center text-xs gap-x-0.5 leading-none"
            >
              {/* Move number */}
              <span className="text-right text-muted-foreground pr-1 select-none tabular-nums font-mono py-[3px]">
                {num}.
              </span>

              {/* White move */}
              <button
                ref={cursor === wi ? activeRef : undefined}
                onClick={() => onGoTo(wi)}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-[3px] rounded-sm hover:bg-accent/70 transition-colors min-w-0",
                  cursor === wi && "bg-accent font-semibold text-foreground"
                )}
              >
                <span className="font-mono truncate flex-1 text-left">{white}</span>
                {wTime != null && (
                  <span className="text-[10px] tabular-nums text-muted-foreground/55 shrink-0 leading-none font-mono">
                    {fmtMoveTime(wTime)}
                  </span>
                )}
              </button>

              {/* Black move */}
              {black ? (
                <button
                  ref={cursor === bi ? activeRef : undefined}
                  onClick={() => onGoTo(bi)}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-[3px] rounded-sm hover:bg-accent/70 transition-colors min-w-0",
                    cursor === bi && "bg-accent font-semibold text-foreground"
                  )}
                >
                  <span className="font-mono truncate flex-1 text-left">{black}</span>
                  {bTime != null && (
                    <span className="text-[10px] tabular-nums text-muted-foreground/55 shrink-0 leading-none font-mono">
                      {fmtMoveTime(bTime)}
                    </span>
                  )}
                </button>
              ) : (
                <span />
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}
