"use client"

import { useT } from "@/lib/i18n";
import { useRef, useMemo, useEffect, useState } from "react";
import { Chess } from "chess.js";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Branch } from "@/types/game.types";
import { Ellipsis, GitBranch, X } from "lucide-react";
import { extractSanMoves } from "@/lib/custom-chess";

/** Format ms compact clock string shown beside each move */
function fmtMoveTime(ms: number): string {
  const tenths = Math.floor(ms / 100) % 10;
  const totalSec = Math.floor(ms / 1000);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  if (min > 0) return `${min}:${String(sec).padStart(2, "0")}.${tenths}`;
  return `${sec}.${tenths}`;
}

interface MovePair {
  num: number;
  white: string;
  black: string | undefined;
  wi: number; // Cursor index AFTER white's move (= i+1 in 0-based ply)
  bi: number; // Cursor index AFTER black's move (= i+2)
  wPly: number; // 0-based ply index of white's move — key into moveTimesMap
  bPly: number; // 0-based ply index of black's move
}

interface Props {
  pgn: string;
  mainPgn?: string;
  cursor: number; // 0 = initial position, n = after n-th half-move
  branches?: Branch[]; // 0-based ply, elapsed ms for that move (from useGame)
  selectedBranchId?: string | null;
  onBranchSelect?: (branch: string | null) => void;
  moveTimesMap?: Record<number, number>;
  followLatest?: boolean;
  onGoTo: (idx: number) => void;
}

function detectBranchPly(mainPgn: string, branches: Branch[]): number {
  if (!branches.length) return -1;
  try {
    const main = new Chess();
    main.loadPgn(mainPgn);
    const mainHist = main.history();

    const branch = new Chess();
    branch.loadPgn(branches[0].pgn);
    const branchHist = branch.history();

    for (let i = 0; i < Math.min(mainHist.length, branchHist.length); i++) {
      if (mainHist[i] !== branchHist[i]) return i;
    }

    // Branch extends main
    return mainHist.length;
  } catch {
    return -1;
  }
}

// Get last move of branch SAN type
function getBranchMoveSan(branch: Branch): string {
  return branch.lastMove?.san
    ?? (branch.lastMove ? `${branch.lastMove.from}${branch.lastMove.to}` : "?");
}

export function PGNTable({ pgn, mainPgn, cursor, branches = [], selectedBranchId = null, onBranchSelect, moveTimesMap, followLatest = false, onGoTo }: Props) {
  const { t } = useT();
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const latestRef = useRef<HTMLButtonElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const [branchOpen, setBranchOpen] = useState(false);
  const selectedBranch = branches.find(b => b.id === selectedBranchId) ?? null;

  const pairs = useMemo((): MovePair[] => {
    if (!pgn?.trim()) return [];
    const hist = extractSanMoves(pgn);
    return Array.from({ length: Math.ceil(hist.length / 2) }, (_, pairIdx) => {
      const i = pairIdx * 2;
      return {
        num: pairIdx + 1,
        white: hist[i],
        black: hist[i + 1],
        wi: i + 1,
        bi: i + 2,
        wPly: i,
        bPly: i + 1,
      };
    });

    // try {
    //   const c = new Chess();
    //   c.loadPgn(pgn);
    //   const hist = c.history();
    //   return Array.from({ length: Math.ceil(hist.length / 2) }, (_, pairIdx) => {
    //     const i = pairIdx * 2;
    //     return {
    //       num: pairIdx + 1,
    //       white: hist[i],
    //       black: hist[i + 1],
    //       wi: i + 1,
    //       bi: i + 2,
    //       wPly: i,
    //       bPly: i + 1,
    //     };
    //   });
    // } catch {
    //   return [];
    // }
  }, [pgn]);

  const branchPly = useMemo(
    () => detectBranchPly(mainPgn ?? pgn, branches),
    [mainPgn ?? pgn, branches]);

  const branchPairIdx = branchPly >= 0 ? Math.floor(branchPly / 2) : -1;
  const branchCol = branchPly >= 0 ? branchPly % 2 : -1;
  const isTrailingBranch = branchPly >= 0 && branchPly >= pairs.length * 2;

  // Scroll only the Radix viewport so the page itself does not jump.
  useEffect(() => {
    const viewport = viewportRef.current;
    const target = followLatest ? latestRef.current : activeRef.current;
    if (!viewport || !target) return;

    const frame = requestAnimationFrame(() => {
      const viewportRect = viewport.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetTop = viewport.scrollTop
        + targetRect.top
        - viewportRect.top
        - (viewport.clientHeight - targetRect.height) / 2;

      viewport.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    });

    return () => cancelAnimationFrame(frame);
  }, [cursor, pairs.length, followLatest, selectedBranchId]);

  function handleBranchClick(b: Branch) {
    if (selectedBranchId === b.id) {
      onBranchSelect?.(null); // deselect
    } else {
      onBranchSelect?.(b.id);
    }
  }

  if (pairs.length === 0) {
    return (
      <ScrollArea className="flex-1 min-h-0 h-full" viewportRef={viewportRef}>
        <div className="min-h-full flex items-center justify-center text-sm text-muted-foreground py-6">
          {t("board.noMoves")}
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="flex-1 min-h-0 h-full" viewportRef={viewportRef}>
      <div className="p-1.5">
        {pairs.map(({ num, white, black, wi, bi, wPly, bPly }, pairIdx) => {
          const wTime = moveTimesMap?.[wPly];
          const bTime = moveTimesMap?.[bPly];
          const isLastPair = pairIdx === pairs.length - 1;
          const isLastWhiteMove = isLastPair && !black;
          const isLastBlackMove = isLastPair && !!black;
          const trailingInBlackSlot = isTrailingBranch && isLastPair && !black;
          const trailingInNewRow = isTrailingBranch && isLastPair && !!black;
          const showBtn = !isTrailingBranch && branches.length > 0 && pairIdx === branchPairIdx;
          const btnAfterW = showBtn && branchCol === 0;
          const btnAfterB = showBtn && branchCol === 1;

          return (
            <div key={num}>
              <div className="grid grid-cols-[30px_1fr_1fr] items-center text-sm gap-x-0.5 leading-none">
                {/* Move number */}
                <span className="text-right text-muted-foreground pr-1 select-none tabular-nums font-mono py-[3px]">
                  {num}.
                </span>

                {/* White move */}
                <div className="flex items-center gap-0 5 min-w-0">
                  {btnAfterW ? (
                    <BranchDots branches={branches} selectedBranchId={selectedBranchId} onSelect={handleBranchClick} />
                  ) : (
                    <button
                      ref={followLatest && isLastWhiteMove ? latestRef : cursor === wi ? activeRef : undefined}
                      onClick={() => onGoTo(wi)}
                      className={cn(
                        "flex items-center gap-1 px-1.5 py-[3px] rounded-sm hover:bg-accent/70 transition-colors min-w-0",
                        cursor === wi && "bg-accent font-semibold text-foreground"
                      )}
                    >
                      <span className="font-mono truncate flex-1 text-left">{white}</span>
                      {wTime != null && (
                        <span className="text-[11px] tabular-nums text-muted-foreground/55 shrink-0 leading-none font-mono">
                          {fmtMoveTime(wTime)}
                        </span>
                      )}
                    </button>
                  )}
                </div>

                {/* Black move */}
                <div className="flex items-center gap-0 5 min-w-0">
                  {btnAfterB ? (
                    <BranchDots branches={branches} selectedBranchId={selectedBranchId} onSelect={handleBranchClick} />
                  ) : trailingInBlackSlot ? (
                    <BranchDots branches={branches} selectedBranchId={selectedBranchId} onSelect={handleBranchClick} />
                  ) : black ? (
                    <button
                      ref={followLatest && isLastBlackMove ? latestRef : cursor === bi ? activeRef : undefined}
                      onClick={() => onGoTo(bi)}
                      className={cn(
                        "flex items-center gap-1 px-1.5 py-[3px] rounded-sm hover:bg-accent/70 transition-colors min-w-0",
                        cursor === bi && "bg-accent font-semibold text-foreground"
                      )}
                    >
                      <span className="font-mono truncate flex-1 text-left">{black}</span>
                      {bTime != null && (
                        <span className="text-[11px] tabular-nums text-muted-foreground/55 shrink-0 leading-none font-mono">
                          {fmtMoveTime(bTime)}
                        </span>
                      )}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              </div>

              {/* BranchLine */}
              {(btnAfterW || btnAfterB || trailingInBlackSlot) && selectedBranch && (
                <div className="ml-[30px] my-0.5 relative">
                  <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full bg-branch-border" />
                  <div className="pl-3">
                    <BranchLine
                      branch={selectedBranch}
                      isSelected={true}
                      onSelect={() => handleBranchClick(selectedBranch)}
                      branchPly={branchPly}
                    />
                  </div>
                </div>
              )}

              {trailingInNewRow && (
                <div>
                  <div className="grid grid-cols-[30px_1fr_1fr] items-center text-sm gap-x-0.5 leading-none">
                    <span />
                    <div className="col-span-2 flex items-center">
                      <BranchDots branches={branches} selectedBranchId={selectedBranchId} onSelect={handleBranchClick} />
                    </div>
                  </div>
                  {selectedBranch && (
                    <div className="ml-[30px] my-0.5 relative">
                      <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full bg-branch-border" />
                      <div className="pl-3">
                        <BranchLine branch={selectedBranch} isSelected={true}
                          onSelect={() => handleBranchClick(selectedBranch)} branchPly={branchPly} />
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function BranchDots({
  branches,
  selectedBranchId,
  onSelect,
}: {
  branches: Branch[];
  selectedBranchId: string | null;
  onSelect: (b: Branch) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  // Closes when clicked outside
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0 ml-0.5">
      <button
        onClick={() => setOpen(v => !v)}
        title={t(branches.length === 1 ? "pgn.alternativeMoves" : "pgn.alternativeMovesPlural", { n: branches.length })}
        className={cn(
          "inline-flex items-center gap-0.5 px-1.5 py-[2px] rounded text-[11px] font-medium transition-colors",
          open || selectedBranchId
            ? "bg-branch-surface text-branch-foreground border border-branch-border"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
        )}
      >
        <Ellipsis className="size-4" />
        {branches.length > 1 && (
          <span className="text-[11px] ml-0.5">{branches.length}</span>
        )}
      </button>

      {/* Dropdown picker */}
      {open && (
        <div
          className="absolute z-50 top-full left-0 mt-1 min-w-[140px] rounded-md border border-branch-border bg-branch-surface shadow-lg overflow-hidden"
        >
          {branches.map((b, i) => (
            <button
              key={b.id}
              onClick={() => { onSelect(b); setOpen(false); }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-branch-hover"
              style={{
                borderBottom: i < branches.length - 1 ? "0.5px solid hsl(var(--branch-hover))" : "none",
                background: selectedBranchId === b.id ? "hsl(var(--branch-hover))" : "transparent",
              }}
            >
              <GitBranch className="size-3.5" />
              <span className="font-mono font-semibold text-branch-foreground">
                {getBranchMoveSan(b)}
              </span>
              <span className="text-[10px] text-branch-muted">
                {t("pgn.step", { n: b.step })}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------- Inline branch line display move chose ---------------------
function BranchLine({
  branch,
  isSelected,
  onSelect,
  branchPly,
}: {
  branch: Branch;
  isSelected: boolean;
  onSelect: () => void;
  branchPly: number;
}) {
  const { t } = useT();
  const branchMoves = useMemo(() => {
    try {
      const c = new Chess();
      c.loadPgn(branch.pgn);
      return c.history().slice(branchPly);
    } catch { return []; }
  }, [branch.pgn, branchPly]);

  if (!branchMoves.length) return null;

  // first branch number
  const startMoveNum = Math.floor(branchPly / 2) + 1;
  const startIsBlack = branchPly % 2 === 1;

  return (
    <div
      className="flex flex-wrap items-center gap-x-0.5 gap-y-0.5 py-1 pr-1 cursor-pointer group"
      onClick={onSelect}
      title={t("pgn.deselectBranch")}
    >
      {branchMoves.map((san, idx) => {
        const ply = branchPly + idx;
        const moveNum = Math.floor(ply / 2) + 1;
        const isBlack = ply % 2 === 1;
        const isFirstMove = idx === 0;
        const isLastMove = idx === branchMoves.length - 1;

        return (
          <span key={idx} className="inline-flex items-center gap-0.5">
            {/* number of moves */}
            {(isFirstMove || !isBlack) && (
              <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                {moveNum}.{isFirstMove && startIsBlack ? ".." : ""}
              </span>
            )}
            <span
              className={cn(
                "font-mono text-xs px-1 py-[1px] rounded-sm",
                isLastMove
                  ? "font-semibold text-branch-foreground bg-branch-surface"
                  : "text-branch-muted"
              )}
            >
              {san}
            </span>
          </span>
        );
      })}
      {/* deselect */}
      <button
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        className="ml-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
        title={t("pgn.closeBranch")}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
