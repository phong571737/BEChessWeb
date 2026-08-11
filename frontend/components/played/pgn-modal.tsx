"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Clock, Hash, Trophy, Calendar, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, GitBranch } from "lucide-react";
import { Chess } from "chess.js";
import { publicPath } from "@/lib/public-path";
import { classifyTimeControl } from "@/lib/time-control";
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
import { MoveAnalysisPanel } from "@/components/played/move-analysis-panel";
import { extractSanMoves } from "@/lib/custom-chess";
import { moveClassificationIcon, moveClassificationTone } from "@/lib/move-classification";

interface Props {
  game:    HistoryGame | null;
  onClose: () => void;
}

interface ReviewProps {
  game: HistoryGame;
}

interface RecoveryLine {
  uciMoves: string[];
  sanMoves: string[];
  assumedFens: string[];
  moveSources?: string[];
}

interface RecoveryStep {
  ply: number;
  moveLists?: RecoveryLine[];
}

interface RecoveryPayload {
  pgn?: unknown;
  steps?: unknown;
  bestMoveLists?: unknown;
}

type RecoveryStatus = "idle" | "loading" | "ready" | "error";

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

function recoveryLineToPgn(game: HistoryGame, line: RecoveryLine): string {
  const savedHeaders = readPgnHeaders(game.pgn ?? "");
  const headers = [
    `[Event "${savedHeaders.Event || "?"}"]`,
    `[Site "${game.location?.trim() || savedHeaders.Site || "?"}"]`,
    `[Date "${savedHeaders.Date || game.Date || "????.??.??"}"]`,
    `[Round "${game.round ?? savedHeaders.Round ?? "1"}"]`,
    `[White "${game.WhiteName || savedHeaders.White || "White"}"]`,
    `[Black "${game.BlackName || savedHeaders.Black || "Black"}"]`,
    `[Result "${game.Result || "*"}"]`,
  ];
  if (game.initialFen) headers.push(`[SetUp "1"]`, `[FEN "${game.initialFen}"]`);
  const moves = line.sanMoves.map((san, index) => index % 2 === 0
    ? `${Math.floor(index / 2) + 1}. ${san}`
    : `${Math.floor(index / 2) + 1}... ${san}`
  ).join(" ");
  return [...headers, "", `${moves} ${game.Result || "*"}`].join("\n");
}

export function PGNReviewContent({ game }: ReviewProps) {
  const { t } = useT();
  const analysisByPly = useMemo(() => new Map((game.analysis?.moves ?? []).map((move) => [move.ply, move])), [game.analysis?.moves]);
  const isFinishedResult = game.historyStatus === "finished" || game.outcomeStatus === "unconfirmed" || game.Result === "1-0" || game.Result === "0-1" || game.Result === "1/2-1/2";
  const resultText = game.outcomeStatus === "unconfirmed"
    ? t("played.unconfirmed")
    : game.Result === "1-0"
    ? t("result.whiteWin")
    : game.Result === "0-1"
      ? t("result.blackWin")
      : game.Result === "1/2-1/2"
        ? t("result.draw")
        : t("played.unfinished");
  const [copied, setCopied] = useState(false);
  const [fenCopied, setFenCopied] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [recoveredPgn, setRecoveredPgn] = useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>("idle");
  const [recoverySteps, setRecoverySteps] = useState<RecoveryStep[]>([]);
  const [recoveryLines, setRecoveryLines] = useState<RecoveryLine[]>([]);
  const [selectedRecoveryLine, setSelectedRecoveryLine] = useState<RecoveryLine | null>(null);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(360);
  const lastWheelTsRef = useRef(0);
  const activeMoveRef = useRef<HTMLButtonElement | null>(null);
  // FEN-backed history notation must come exclusively from recover-service.
  // A failed request is surfaced to the user instead of invoking a local
  // renderer that could disagree with the canonical recovery algorithm.
  useEffect(() => {
    let cancelled = false;
    setRecoveredPgn(null);
    setRecoverySteps([]);
    setRecoveryLines([]);
    setSelectedRecoveryLine(null);
    setRecoveryStatus(game.fenHistory?.length ? "loading" : "idle");
    if (!game._id || !game.fenHistory?.length) return () => { cancelled = true; };

    fetch(`/games/history/${encodeURIComponent(game._id)}/recovered-pgn`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Recovery request failed with HTTP ${response.status}`);
        const data = await response.json() as RecoveryPayload;
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        if (typeof data.pgn !== "string" || !data.pgn.trim()) throw new Error("Recovery response did not include PGN");
        setRecoveredPgn(data.pgn);
        if (Array.isArray(data.steps)) setRecoverySteps(data.steps as RecoveryStep[]);
        if (Array.isArray(data.bestMoveLists)) setRecoveryLines(data.bestMoveLists as RecoveryLine[]);
        setRecoveryStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setRecoveryStatus("error");
      });

    return () => { cancelled = true; };
  }, [game._id, game.fenHistory]);

  const reviewPgn = useMemo(() => {
    if (selectedRecoveryLine) return recoveryLineToPgn(game, selectedRecoveryLine);
    if (game.fenHistory?.length) return recoveredPgn ?? "";
    return game.pgn ?? "";
  }, [game, recoveredPgn, selectedRecoveryLine]);

  const timeline = useMemo(() => {
    if (!game) return [{ fen: "start", san: "start", lastMove: null as { from: string; to: string } | null }];
    if (Array.isArray(game.fenHistory) && game.fenHistory.length > 0) {
      if (recoveryStatus !== "ready" || !reviewPgn) {
        return [{ fen: game.initialFen ?? DEFAULT_FEN, san: "start", lastMove: null }];
      }
      // Notation comes from recover-service; FEN snapshots remain authoritative
      // for board navigation, including custom/partially legal device games.
      const serviceMoves = selectedRecoveryLine?.sanMoves ?? extractSanMoves(reviewPgn);
      const selectedFens = selectedRecoveryLine?.assumedFens;
      const sourceFens = (selectedFens?.length ? selectedFens : game.fenHistory).slice(0, serviceMoves.length);
      const out: Array<{ fen: string; san: string; lastMove: { from: string; to: string } | null; fenFallback?: boolean }> = [
        { fen: game.initialFen ?? DEFAULT_FEN, san: "start", lastMove: null },
      ];

      const temp = new Chess(game.initialFen ?? DEFAULT_FEN, { skipValidation: true });
      for (let i = 0; i < sourceFens.length; i++) {
        const nextFen = sourceFens[i];
        const san = serviceMoves[i]!;
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
    // Records without FEN snapshots can only be displayed from the recovered
    // PGN text itself. This path is uncommon and still uses the sidecar PGN
    // whenever it was returned.
    try {
      const c = new Chess();
      c.loadPgn(reviewPgn);
      const temp = new Chess();
      const out: Array<{ fen: string; san: string; lastMove: { from: string; to: string } | null }> = [
        { fen: temp.fen(), san: "start", lastMove: null },
      ];
      for (const san of c.history()) {
        const mv = temp.move(san);
        out.push({ fen: temp.fen(), san, lastMove: mv ? { from: mv.from, to: mv.to } : null });
      }
      if (out.length > 1) return out;
    } catch {}
    return [{ fen: "start", san: "start", lastMove: null }];
  }, [game, recoveryStatus, reviewPgn, selectedRecoveryLine]);

  const currentIndex = cursor === -1 ? timeline.length - 1 : Math.max(0, Math.min(cursor, timeline.length - 1));
  const current = timeline[currentIndex];
  const recoveryNotice = game.fenHistory?.length && recoveryStatus !== "ready"
    ? (recoveryStatus === "loading" ? t("rev.loading") : t("pg.recoveryUnavailable"))
    : "";

  const recoveryAlternatives = useMemo(() => {
    const alternatives = new Map<number, RecoveryLine[]>();
    for (const step of recoverySteps) {
      const lines = Array.isArray(step.moveLists) ? step.moveLists : [];
      const unique = new Map<string, RecoveryLine>();
      for (const line of lines) {
        const move = line.sanMoves?.[step.ply - 1];
        if (move && !unique.has(move)) unique.set(move, line);
      }
      if (unique.size > 1) alternatives.set(step.ply, [...unique.values()]);
    }
    return alternatives;
  }, [recoverySteps]);

  const selectRecoveryAlternative = useCallback((ply: number, line: RecoveryLine) => {
    const prefix = line.uciMoves?.slice(0, ply) ?? [];
    const completeLine = recoveryLines.find((candidate) =>
      prefix.length > 0 && prefix.every((move, index) => candidate.uciMoves?.[index] === move)
    );
    setSelectedRecoveryLine(completeLine ?? line);
    setCursor(Math.max(0, Math.min(ply, (completeLine ?? line).sanMoves.length)));
  }, [recoveryLines]);

  useEffect(() => {
    setCursor(-1);
    setSelectedRecoveryLine(null);
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
  const copiedResetTimerRef = useRef<number | null>(null);
  const fenCopiedResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedResetTimerRef.current !== null) window.clearTimeout(copiedResetTimerRef.current);
      if (fenCopiedResetTimerRef.current !== null) window.clearTimeout(fenCopiedResetTimerRef.current);
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
  }, []);

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
      if (copiedResetTimerRef.current !== null) window.clearTimeout(copiedResetTimerRef.current);
      copiedResetTimerRef.current = window.setTimeout(() => {
        copiedResetTimerRef.current = null;
        setCopied(false);
      }, 2000);
    } catch {}
  };

  const copyFenTimeline = async () => {
    if (!game.fenHistory?.length) return;
    try {
      await navigator.clipboard.writeText(game.fenHistory.map((fen, index) => `${index + 1}. ${fen}`).join("\n"));
      setFenCopied(true);
      if (fenCopiedResetTimerRef.current !== null) window.clearTimeout(fenCopiedResetTimerRef.current);
      fenCopiedResetTimerRef.current = window.setTimeout(() => {
        fenCopiedResetTimerRef.current = null;
        setFenCopied(false);
      }, 2000);
    } catch {}
  };

  const downloadFenTimeline = () => {
    if (!game._id || !game.fenHistory?.length) return;
    const link = document.createElement("a");
    link.href = publicPath(`/games/history/${encodeURIComponent(game._id)}/fen-text`);
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <>
        <div className="flex flex-col gap-1.5 p-4 sm:p-5 border-b border-border bg-card">
          <div className="flex items-center gap-2 flex-wrap pr-8">
            <h2 className="text-base sm:text-lg font-semibold leading-none tracking-tight">
              {game.WhiteName} vs {game.BlackName}
            </h2>
            <Badge variant={isFinishedResult && game.outcomeStatus !== "unconfirmed" ? resultVariant(game.Result) : "secondary"} className={`w-28 justify-center shrink-0${(!isFinishedResult || game.outcomeStatus === "unconfirmed") ? " border border-primary/25 bg-primary/10 text-primary" : ""}`}>
              {resultText}
            </Badge>
            <Badge variant="outline" className="shrink-0 border-primary/20 bg-primary/5 text-primary">
              {t(`timeControl.${game.timeControlType ?? classifyTimeControl(game.initialTimeMs)}` as "timeControl.blitz" | "timeControl.rapid" | "timeControl.classical")}
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
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(320px,520px)_1fr]">
            <div
              ref={boardWrapRef}
              className="w-full max-w-[560px] select-none overscroll-contain"
              title={t("rev.wheelNavigation")}
            >
              <ChessBoardView fen={current.fen} lastMove={current.lastMove} boardWidth={boardWidth} />
            </div>
            <div className="flex h-[420px] min-h-0 flex-col overflow-hidden rounded-sm border border-border bg-muted/50 xl:h-[520px]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">{t("rev.moveReview")}</span>
                <span className="text-xs font-mono text-muted-foreground">Ply {currentIndex}/{timeline.length - 1}</span>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-3">
                  {recoveryNotice && (
                    <p className="col-span-full p-3 text-xs text-muted-foreground">
                      {recoveryNotice}
                    </p>
                  )}
                  {timeline.slice(1).map((m, i) => {
                    const ply = i + 1;
                    const alternatives = recoveryAlternatives.get(ply) ?? [];
                    const moveAnalysis = analysisByPly.get(ply);
                    const ClassificationIcon = moveAnalysis ? moveClassificationIcon[moveAnalysis.classification] : null;
                    return (
                      <Fragment key={`${m.san}-${i}`}>
                        <button
                          ref={currentIndex === ply ? activeMoveRef : undefined}
                          type="button"
                          onClick={() => goTo(ply)}
                          className={m.fenFallback
                            ? `col-span-full min-h-9 rounded-sm border px-3 py-2 text-left font-mono text-xs transition-colors ${currentIndex === ply ? "border-primary/40 bg-primary/10 text-foreground" : "border-warning/30 bg-warning/5 text-muted-foreground hover:bg-warning/10"}`
                            : `min-h-9 rounded-sm border px-3 py-2 text-left text-sm ${currentIndex === ply ? "border-border bg-accent text-foreground" : "border-transparent text-muted-foreground hover:bg-accent/70"}`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span>{ply}. {m.san}</span>
                            {moveAnalysis && ClassificationIcon && moveAnalysis.classification !== "unavailable" && (
                              <span
                                className={`inline-flex size-6 shrink-0 items-center justify-center rounded-sm border ${moveClassificationTone[moveAnalysis.classification]}`}
                                title={t(`analysis.${moveAnalysis.classification}`)}
                                aria-label={t(`analysis.${moveAnalysis.classification}`)}
                              >
                                <ClassificationIcon className="size-3.5" aria-hidden="true" />
                              </span>
                            )}
                          </span>
                        </button>
                        {alternatives.length > 1 && (
                          <div className="col-span-full flex items-center gap-1 pl-2 -mt-0.5 mb-0.5">
                            <GitBranch className="size-3 text-primary shrink-0" />
                            <span className="text-[10px] text-muted-foreground mr-1">{t("rev.recoveryAlternatives")}</span>
                            {alternatives.map((line, optionIndex) => {
                              const label = line.sanMoves?.[ply - 1] ?? "x";
                              const selected = selectedRecoveryLine?.sanMoves?.[ply - 1] === label;
                              return (
                                <Button
                                  key={`${ply}-${label}-${optionIndex}`}
                                  type="button"
                                  variant={selected ? "secondary" : "outline"}
                                  size="sm"
                                  className="h-6 px-2 text-[10px] font-mono"
                                  onClick={() => selectRecoveryAlternative(ply, line)}
                                >
                                  {label}
                                </Button>
                              );
                            })}
                          </div>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="flex items-center justify-center gap-3 border-t border-border p-3">
                <Button variant="outline" size="icon" className="h-10 w-12" onClick={() => goTo(0)} disabled={currentIndex === 0}>
                  <ChevronsLeft className="size-5" />
                </Button>
                <Button variant="outline" size="icon" className="h-10 w-12" onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0}>
                  <ChevronLeft className="size-5" />
                </Button>
                <Button variant="outline" size="icon" className="h-10 w-12" onClick={() => goTo(currentIndex + 1)} disabled={currentIndex >= timeline.length - 1}>
                  <ChevronRight className="size-5" />
                </Button>
                <Button variant="outline" size="icon" className="h-10 w-12" onClick={() => goTo(timeline.length - 1)} disabled={currentIndex >= timeline.length - 1}>
                  <ChevronsRight className="size-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* PGN section */}
        <div className="px-4 sm:px-5 pb-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("rev.pgnNotation")}</span>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={copyPGN} disabled={!reviewPgn}>
              {copied
                ? <><Check className="h-3 w-3" />{t("rev.copiedPgn")}</>
                : <><Copy className="h-3 w-3" />{t("rev.copyPgn")}</>
              }
            </Button>
          </div>

          {/* Moves only */}
          <ScrollArea className="h-36 rounded-sm border border-border bg-muted">
            <pre className="p-3 font-mono text-xs text-foreground whitespace-pre-wrap break-words">
              {reviewPgn ? movesOnly(reviewPgn) : recoveryNotice}
            </pre>
          </ScrollArea>

          {/* Full PGN collapsible */}
          {reviewPgn && <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium select-none">
              {t("rev.showFullPgn")}
            </summary>
            <ScrollArea className="mt-2 h-44 rounded-sm border border-border bg-muted">
              <pre className="p-3 font-mono text-xs text-foreground whitespace-pre-wrap break-words">
                {reviewPgn}
              </pre>
            </ScrollArea>
          </details>}

          {!!game.fenHistory?.length && (
            <details className="relative text-sm">
              <summary className="cursor-pointer pb-10 font-semibold text-muted-foreground hover:text-foreground select-none sm:pb-0 sm:pr-72">
                {t("rev.fenTimeline")} ({game.fenHistory.length})
              </summary>
              <div className="absolute left-0 top-8 flex max-w-full flex-wrap items-center gap-1.5 sm:left-auto sm:right-0 sm:top-[-4px] sm:flex-nowrap">
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={copyFenTimeline}>
                  {fenCopied
                    ? <><Check className="h-3.5 w-3.5" />{t("rev.copiedFen")}</>
                    : <><Copy className="h-3.5 w-3.5" />{t("rev.copyFen")}</>
                  }
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={downloadFenTimeline}>
                  <Download className="h-3.5 w-3.5" />{t("rev.downloadFenText")}
                </Button>
              </div>
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

        </div>
        <MoveAnalysisPanel game={game} currentPly={currentIndex} onSelectPly={goTo} />
    </>
  );
}

export function PGNModal({ game, onClose }: Props) {
  if (!game) return null;
  return (
    <Dialog open={!!game} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl overflow-hidden p-2 sm:p-3">
        <PGNReviewContent game={game} />
      </DialogContent>
    </Dialog>
  );
}
