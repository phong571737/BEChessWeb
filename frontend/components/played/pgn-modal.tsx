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
import { resultVariant, formatDateTime, formatDuration, resolveDurationSeconds } from "@/lib/game-utils";
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

function readPgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of pgn.split(/\r?\n/)) {
    const match = line.match(/^\[([^\s]+)\s+"(.*)"\]$/);
    if (match) headers[match[1]] = match[2];
    else if (line.trim() && !line.startsWith("[")) break;
  }
  return headers;
}

const DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function fenBoard(fen: string): Record<string, string> {
  const board: Record<string, string> = {};
  const rows = fen.split(" ")[0]?.split("/") ?? [];
  rows.forEach((row, rowIndex) => {
    let file = 0;
    for (const char of row) {
      if (/\d/.test(char)) file += Number(char);
      else { board[`${"abcdefgh"[file]}${8 - rowIndex}`] = char; file += 1; }
    }
  });
  return board;
}

/** Best-effort FEN diff used only when an e-board omitted a UCI token. */
function inferUciFromFen(before: string, after: string): string | null {
  const previous = fenBoard(before);
  const next = fenBoard(after);
  const changed = Array.from(new Set([...Object.keys(previous), ...Object.keys(next)])).filter((square) => previous[square] !== next[square]);
  const targets = changed.filter((square) => next[square] && (!previous[square] || next[square]?.toLowerCase() !== previous[square]?.toLowerCase()));
  for (const to of targets) {
    const color = next[to] === next[to]?.toUpperCase();
    const from = changed.find((square) => previous[square] && (previous[square] === previous[square]?.toUpperCase()) === color && !next[square]);
    if (from) return `${from}${to}${next[to]?.toLowerCase() !== "p" && previous[from]?.toLowerCase() === "p" ? next[to]?.toLowerCase() : ""}`;
  }
  return null;
}

function formatCustomMove(uci: string, board: Record<string, string>): string {
  const match = uci.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
  if (!match) return "x";
  const [, from, to, promotion] = match;
  const piece = board[from];
  if (!piece) return "x";

  const type = piece.toLowerCase();
  const fileDelta = Math.abs(from.charCodeAt(0) - to.charCodeAt(0));
  if (type === "k" && fileDelta === 2) {
    const kingSide = to.charCodeAt(0) > from.charCodeAt(0);
    const rank = from[1];
    const rookFrom = `${kingSide ? "h" : "a"}${rank}`;
    const rookTo = `${kingSide ? "f" : "d"}${rank}`;
    if (board[rookFrom]) { board[rookTo] = board[rookFrom]!; delete board[rookFrom]; }
    board[to] = piece;
    delete board[from];
    return kingSide ? "O-O" : "O-O-O";
  }

  const isPawn = type === "p";
  const capture = Boolean(board[to]) || (isPawn && from[0] !== to[0]);
  const notation = isPawn
    ? `${capture ? from[0] : ""}${capture ? "x" : ""}${to}${promotion ? `=${promotion.toUpperCase()}` : ""}`
    : `${type.toUpperCase()}${capture ? "x" : ""}${to}`;

  if (isPawn && capture && !board[to]) delete board[`${to[0]}${from[1]}`];
  board[to] = promotion ? (piece === piece.toUpperCase() ? promotion.toUpperCase() : promotion.toLowerCase()) : piece;
  delete board[from];
  return notation;
}

function checkSuffix(fen: string | undefined): string {
  if (!fen) return "";
  try {
    const game = new Chess(fen, { skipValidation: true });
    return game.isCheckmate() ? "#" : game.isCheck() ? "+" : "";
  } catch {
    return "";
  }
}

function customMoveTokens(game: HistoryGame): string[] {
  const count = Math.max(game.uciHistory?.length ?? 0, game.fenHistory?.length ?? 0);
  const board = fenBoard(game.initialFen ?? DEFAULT_FEN);
  let previousFen = game.initialFen ?? DEFAULT_FEN;
  return Array.from({ length: count }, (_, index) => {
    const uci = game.uciHistory?.[index]?.trim();
    const recoveredUci = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i.test(uci ?? "")
      ? uci!
      : (game.fenHistory?.[index] ? inferUciFromFen(previousFen, game.fenHistory[index]!) : null);
    const notation = recoveredUci ? formatCustomMove(recoveredUci, board) : "x";
    const nextFen = game.fenHistory?.[index];
    if (nextFen) previousFen = nextFen;
    return `${notation}${checkSuffix(nextFen)}`;
  });
}

function customReviewPgn(game: HistoryGame): string {
  const count = Math.max(game.uciHistory?.length ?? 0, game.fenHistory?.length ?? 0);
  // UCI/FEN are the durable source for e-board games. Rebuilding from them
  // repairs older custom PGN records that omitted check/checkmate suffixes.
  if (!count) return game.pgn;
  const moves = customMoveTokens(game);
  const lines: string[] = [];
  for (let index = 0; index < moves.length; index += 2) lines.push(`${index / 2 + 1}. ${moves[index]}${moves[index + 1] ? ` ${moves[index + 1]}` : ""}`);
  const result = game.Result || "*";
  const savedHeaders = readPgnHeaders(game.pgn ?? "");
  const headers = [
    `[Event "${savedHeaders.Event || "?"}"]`,
    `[Site "${savedHeaders.Site || "?"}"]`,
    `[Date "${savedHeaders.Date || game.Date || "????.??.??"}"]`,
    `[Round "${savedHeaders.Round || "?"}"]`,
    `[White "${game.WhiteName || savedHeaders.White || "White"}"]`,
    `[Black "${game.BlackName || savedHeaders.Black || "Black"}"]`,
    `[Result "${result}"]`,
  ];
  if (game.initialFen) {
    headers.push(`[SetUp "1"]`, `[FEN "${game.initialFen}"]`);
  }
  return [...headers, "", `${lines.join(" ")} ${result}`].join("\n");
}

export function PGNReviewContent({ game }: ReviewProps) {
  const { t } = useT();
  const isFinishedResult = game.Result === "1-0" || game.Result === "0-1" || game.Result === "1/2-1/2";
  const resultText = game.Result === "1-0"
    ? t("result.whiteWin")
    : game.Result === "0-1"
      ? t("result.blackWin")
      : game.Result === "1/2-1/2"
        ? t("result.draw")
        : t("played.unfinished");
  const [copied, setCopied] = useState(false);
  const [fenCopied, setFenCopied] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(360);
  const lastWheelTsRef = useRef(0);
  const activeMoveRef = useRef<HTMLButtonElement | null>(null);
  const reviewPgn = useMemo(() => customReviewPgn(game), [game]);

  const timeline = useMemo(() => {
    if (!game) return [{ fen: "start", san: "start", lastMove: null as { from: string; to: string } | null }];
    const customMoves = customMoveTokens(game);
    try {
      const c = new Chess();
      c.loadPgn(game.pgn);
      const sans = c.history();
      const temp = new Chess();
      const out: Array<{ fen: string; san: string; lastMove: { from: string; to: string } | null; fenFallback?: boolean }> = [
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
      if (out.length > 1) return out;
    } catch {}

    if (Array.isArray(game.fenHistory) && game.fenHistory.length > 0) {
      const out: Array<{ fen: string; san: string; lastMove: { from: string; to: string } | null; fenFallback?: boolean }> = [
        { fen: "start", san: "start", lastMove: null },
      ];

      const temp = new Chess();
      for (let i = 0; i < game.fenHistory.length; i++) {
        const nextFen = game.fenHistory[i];
        let san = customMoves[i] ?? "x";
        let lastMove: { from: string; to: string } | null = null;

        try {
          const prevFen = temp.fen();
          const legal = temp.moves({ verbose: true });
          for (const mv of legal) {
            temp.load(prevFen);
            temp.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
            if (temp.fen() === nextFen) {
              lastMove = { from: mv.from, to: mv.to };
              break;
            }
          }
          temp.load(nextFen);
        } catch {}

        out.push({ fen: nextFen, san, lastMove, fenFallback: true });
      }
      return out;
    }
    return [{ fen: "start", san: "start", lastMove: null }];
  }, [game]);

  const currentIndex = cursor === -1 ? timeline.length - 1 : Math.max(0, Math.min(cursor, timeline.length - 1));
  const current = timeline[currentIndex];

  useEffect(() => {
    setCursor(-1);
  }, [game?._id]);

  useEffect(() => {
    activeMoveRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentIndex]);

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

  const audioCtxRef = useRef<AudioContext | null>(null);
  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
  };

  const playNavSound = (forward: boolean) => {
    const ctx = getAudioCtx();
    if (!ctx) return;
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
    osc.onended = () => {};
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
      await navigator.clipboard.writeText(reviewPgn);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const copyFenTimeline = async () => {
    if (!game.fenHistory?.length) return;
    try {
      await navigator.clipboard.writeText(game.fenHistory.map((fen, index) => `${index + 1}. ${fen}`).join("\n"));
      setFenCopied(true);
      setTimeout(() => setFenCopied(false), 2000);
    } catch {}
  };

  return (
    <>
        <div className="flex flex-col gap-1.5 p-4 sm:p-5 border-b border-border bg-card">
          <div className="flex items-center gap-2 flex-wrap pr-8">
            <h2 className="text-base sm:text-lg font-semibold leading-none tracking-tight">
              {game.WhiteName} vs {game.BlackName}
            </h2>
            <Badge variant={isFinishedResult ? resultVariant(game.Result) : "secondary"} className={`w-28 justify-center shrink-0${isFinishedResult ? "" : " border border-primary/25 bg-primary/10 text-primary"}`}>
              {resultText}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(game.createdAt || game.endedAt || game.Date)}
          </p>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 px-4 sm:px-5 pt-4">
          <div className="rounded-sm border border-border bg-muted p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Clock className="h-3 w-3" />
              {t("rev.duration")}
            </div>
            <span className="text-sm font-medium font-mono">{formatDuration(resolveDurationSeconds(game.durationSec, game.startedAt || game.createdAt || game.createAt, game.endedAt || game.lastMoveAt || game.updatedAt))}</span>
          </div>
          <div className="rounded-sm border border-border bg-muted p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Hash className="h-3 w-3" />
              {t("rev.moves")}
            </div>
            <span className="text-sm font-medium">{Math.max(game.totalPlies ?? 0, game.totalMoves ?? 0, Math.max(0, timeline.length - 1), Math.max(0, (game.fenHistory?.length ?? 0)))}</span>
          </div>
          <div className="rounded-sm border border-border bg-muted p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Trophy className="h-3 w-3" />
              {t("rev.result")}
            </div>
            <span className="text-sm font-medium">{resultText}</span>
          </div>
          <div className="rounded-sm border border-border bg-muted p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Calendar className="h-3 w-3" />
              {t("rev.started")}
            </div>
            <span className="text-sm font-medium">{formatDateTime(game.startedAt || game.createdAt || game.createAt || game.Date)}</span>
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
                <span className="text-xs font-mono text-muted-foreground">Ply {currentIndex}/{timeline.length - 1}</span>
              </div>
              <ScrollArea className="h-[160px]">
                <div className="p-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {timeline.slice(1).map((m, i) => (
                    m.fenFallback ? (
                    <button
                      key={`${m.san}-${i}`}
                      ref={currentIndex === i + 1 ? activeMoveRef : undefined}
                      type="button"
                      onClick={() => goTo(i + 1)}
                      className={`col-span-full rounded-sm border px-2 py-1 text-left font-mono text-[10px] transition-colors ${
                        currentIndex === i + 1 ? "border-primary/40 bg-primary/10 text-foreground" : "border-warning/30 bg-warning/5 text-muted-foreground hover:bg-warning/10"
                      }`}
                    >
                      {i + 1}. {m.san}
                    </button>
                    ) : <button
                      key={`${m.san}-${i}`}
                      ref={currentIndex === i + 1 ? activeMoveRef : undefined}
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
              {movesOnly(reviewPgn)}
            </pre>
          </ScrollArea>

          {/* Full PGN collapsible */}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium select-none">
              {t("rev.showFullPgn")}
            </summary>
            <ScrollArea className="mt-2 h-44 rounded-sm border border-border bg-muted">
              <pre className="p-3 font-mono text-xs text-foreground whitespace-pre-wrap break-words">
                {reviewPgn}
              </pre>
            </ScrollArea>
          </details>

          {!!game.fenHistory?.length && (
            <details className="relative text-sm">
              <summary className="cursor-pointer pr-28 font-semibold text-muted-foreground hover:text-foreground select-none">
                FEN Timeline ({game.fenHistory.length})
              </summary>
              <Button variant="outline" size="sm" className="absolute right-0 top-[-4px] h-8 text-xs gap-1.5" onClick={copyFenTimeline}>
                {fenCopied
                  ? <><Check className="h-3.5 w-3.5" />{t("rev.copiedFen")}</>
                  : <><Copy className="h-3.5 w-3.5" />{t("rev.copyFen")}</>
                }
              </Button>
              <div className="mt-2">
                <ScrollArea className="h-44 rounded-sm border border-border bg-muted">
                  <div className="p-3 space-y-1.5">
                    {game.fenHistory.map((f, i) => (
                      <div key={`fh-${i}`} className="font-mono text-xs border border-border/60 rounded-sm px-2.5 py-1.5">
                        <span className="text-muted-foreground mr-2">{i + 1}.</span>{f}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </details>
          )}

          {/* Display move from esp32 */}
          {!!game.uciHistory?.length && (
            <div className="space-y-1">
              <span className="text-sm font-medium">{t("rev.moveEBoard")}</span>
              <ScrollArea className="h-36 rounded-sm border border-border bg-muted">
                <pre className="p-3 font-mono text-xs text-foreground whitespace-pre-wrap break-words">
                  {game.uciHistory.map((u, i) => `${i + 1}.${u}`).join(" ")}
                </pre>
              </ScrollArea>
            </div>
          )}

          {!game.pgn?.trim() && !!game.fenHistory?.length && (
            <div className="text-[11px] text-amber-600 dark:text-amber-400">Using FEN fallback (PGN missing).</div>
          )}
        </div>
    </>
  );
}

export function PGNModal({ game, onClose }: Props) {
  if (!game) return null;
  return (
    <Dialog open={!!game} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-2 sm:p-3 overflow-hidden">
        <PGNReviewContent game={game} />
      </DialogContent>
    </Dialog>
  );
}
