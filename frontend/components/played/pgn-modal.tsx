"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Clock, Hash, Trophy, Calendar, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, BarChart3, EyeOff, Lightbulb, Trash2 } from "lucide-react";
import { Chess } from "chess.js";
import { publicPath } from "@/lib/public-path";
import { resolveTimeControlType } from "@/lib/time-control";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ChessBoardView, type PredictedMove } from "@/components/board/chess-board-view";
import { EvalBar } from "@/components/board/eval-bar";
import { useStockfish } from "@/hooks/use-stockfish";
import { resultVariant, formatDateTime, formatDuration, resolveDurationSeconds } from "@/lib/game-utils";
import { useT } from "@/lib/i18n";
import type { HistoryGame } from "@/types/game.types";
import { MoveAnalysisPanel } from "@/components/played/move-analysis-panel";
import type { MoveAnalysis } from "@/lib/post-game-analysis";
import { useAuth } from "@/lib/auth-context";

interface Props {
  game:    HistoryGame | null;
  onClose: () => void;
}

interface ReviewProps {
  game: HistoryGame;
  onGameUpdate?: (game: HistoryGame) => void;
}

interface RecoveryLine {
  uciMoves: string[];
  sanMoves: string[];
  assumedFens: string[];
  moveSources?: string[];
}

interface RecoveryStep {
  effectivePly?: number;
  originalPly?: number | null;
  synthetic?: boolean;
}

interface RecoveryPayload {
  pgn?: unknown;
  bestMoveLists?: unknown;
  steps?: unknown;
  preprocessing?: unknown;
}

interface ReviewMove {
  fen: string;
  san: string;
  lastMove: { from: string; to: string } | null;
  fenFallback?: boolean;
  originalPly?: number | null;
  padding?: boolean;
  assumed?: boolean;
  deduplicatedFenCount?: number;
}

type RecoveryStatus = "idle" | "loading" | "ready" | "unavailable" | "branch_limit" | "timeout" | "error";
type ReviewSource = "base" | number;

function isRecoveryLine(value: unknown): value is RecoveryLine {
  if (!value || typeof value !== "object") return false;
  const line = value as Partial<RecoveryLine>;
  return Array.isArray(line.uciMoves)
    && Array.isArray(line.sanMoves)
    && Array.isArray(line.assumedFens);
}

function isRecoveryStep(value: unknown): value is RecoveryStep {
  if (!value || typeof value !== "object") return false;
  const step = value as RecoveryStep;
  return (step.originalPly === undefined || step.originalPly === null || Number.isInteger(step.originalPly))
    && (step.effectivePly === undefined || Number.isInteger(step.effectivePly));
}

function readProcessedIndexes(value: unknown): number[][] {
  if (!value || typeof value !== "object") return [];
  const indexes = (value as { processedToInputIndexes?: unknown }).processedToInputIndexes;
  if (!Array.isArray(indexes)) return [];
  return indexes.map((group) => Array.isArray(group)
    ? group.filter((index): index is number => Number.isInteger(index) && index >= 0)
    : []
  );
}

function traceRecovery(stage: string, value: unknown): void {
  if (typeof window === "undefined") return;
  if (new URLSearchParams(window.location.search).get("debugRecovery") !== "1") return;
  console.log(`[FEN RECOVERY ${stage}]`, value);
}

function movesOnly(pgn: string): string {
  return pgn.replace(/\[[^\]]+\]\s*/g, "").trim();
}

/** Reject malformed/custom snapshots before sending them to the WASM engine. */
function isEngineSafeFen(fen: string): boolean {
  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6 || !/^[wb]$/.test(fields[1]!)) return false;
  const ranks = fields[0]!.split("/");
  if (ranks.length !== 8) return false;
  let whiteKing = false;
  let blackKing = false;
  for (const rank of ranks) {
    let files = 0;
    for (const symbol of rank) {
      if (/^[1-8]$/.test(symbol)) files += Number(symbol);
      else if (/^[prnbqkPRNBQK]$/.test(symbol)) {
        files += 1;
        whiteKing ||= symbol === "K";
        blackKing ||= symbol === "k";
      } else return false;
    }
    if (files !== 8) return false;
  }
  return whiteKing && blackKing
    && /^(?:-|[KQkq]+)$/.test(fields[2]!)
    && /^(?:-|[a-h][36])$/.test(fields[3]!)
    && /^\d+$/.test(fields[4]!) && /^\d+$/.test(fields[5]!);
}

/**
 * Pairs White and Black SAN under one conventional full-move number without
 * changing any notation or recovery comments returned by recover-service.
 */
export function formatPgnForDisplay(pgn: string): string {
  if (!pgn.trim()) return "";

  const headers = pgn
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("[") && line.endsWith("]"));
  const movetext = movesOnly(pgn)
    .replace(/(\d+)\.\s+(?!\.)([\s\S]*?)\s+\1\.\.\.\s+/g, "$1. $2 ")
    .replace(/\s+(?=\d+\.\s+(?!\.))/g, "\n")
    .trim();

  return headers.length > 0 ? `${headers.join("\n")}\n\n${movetext}` : movetext;
}

/** Formats a persisted per-ply duration without inventing data for legacy games. */
function formatMoveDuration(ms: number | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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
  const initialFen = game.initialFen ?? DEFAULT_FEN;
  const chess = new Chess(initialFen, { skipValidation: true });
  chess.setHeader("Event", savedHeaders.Event || "?");
  chess.setHeader("Site", game.location?.trim() || savedHeaders.Site || "?");
  chess.setHeader("Date", savedHeaders.Date || game.Date || "????.??.??");
  chess.setHeader("Round", String(game.round ?? savedHeaders.Round ?? "1"));
  chess.setHeader("White", game.WhiteName || savedHeaders.White || "White");
  chess.setHeader("Black", game.BlackName || savedHeaders.Black || "Black");
  chess.setHeader("Result", game.Result || "*");
  if (game.initialFen) {
    chess.setHeader("SetUp", "1");
    chess.setHeader("FEN", game.initialFen);
  }
  for (const uci of line.uciMoves) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) continue;
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined });
  }
  return chess.pgn();
}

export function PGNReviewContent({ game, onGameUpdate }: ReviewProps) {
  const { t } = useT();
  const { isAdmin, token } = useAuth();
  // Keep analysis isolated per review source. A recovered branch is a
  // client-local line, so its classifications must never overwrite (or be
  // confused with) the persisted analysis of the original PGN.
  const [baseAnalysisMoves, setBaseAnalysisMoves] = useState<MoveAnalysis[]>(game.analysis?.moves ?? []);
  const [branchAnalysisBySource, setBranchAnalysisBySource] = useState<Record<string, MoveAnalysis[]>>({});
  const analysisByPly = useMemo(() => new Map(baseAnalysisMoves.map((move) => [move.ply, move])), [baseAnalysisMoves]);
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
  const [pendingFenIndex, setPendingFenIndex] = useState<number | null>(null);
  const [deletingFen, setDeletingFen] = useState(false);
  const [fenDeleteError, setFenDeleteError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(-1);
  const [basePgn, setBasePgn] = useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>("idle");
  const [recoveryLines, setRecoveryLines] = useState<RecoveryLine[]>([]);
  const [recoverySteps, setRecoverySteps] = useState<RecoveryStep[]>([]);
  const [processedToInputIndexes, setProcessedToInputIndexes] = useState<number[][]>([]);
  const [selectedSource, setSelectedSource] = useState<ReviewSource>("base");
  const [showHistoryEvaluation, setShowHistoryEvaluation] = useState(true);
  const [showHistorySuggestions, setShowHistorySuggestions] = useState(true);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(360);
  const lastWheelTsRef = useRef(0);
  const activeMoveRef = useRef<HTMLButtonElement | null>(null);
  // FEN-backed history notation must come exclusively from recover-service.
  // A failed request is surfaced to the user instead of invoking a local
  // renderer that could disagree with the canonical recovery algorithm.
  useEffect(() => {
    let cancelled = false;
    setBasePgn(null);
    setRecoveryLines([]);
    setRecoverySteps([]);
    setProcessedToInputIndexes([]);
    setSelectedSource("base");
    setRecoveryStatus(game.fenHistory?.length ? "loading" : "idle");
    if (!game._id || !game.fenHistory?.length) return () => { cancelled = true; };

    traceRecovery("1 - fenHistory frontend nhận từ GET /games/history", {
      gameId: game._id,
      count: game.fenHistory.length,
      initialFen: game.initialFen ?? DEFAULT_FEN,
      fenHistory: game.fenHistory,
    });

    const debugQuery = typeof window !== "undefined"
      && new URLSearchParams(window.location.search).get("debugRecovery") === "1"
      ? "?debugRecovery=1"
      : "";
    fetch(`/games/history/${encodeURIComponent(game._id)}/recovered-pgn${debugQuery}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { code?: unknown } | null;
          if (body?.code === "RECOVERY_BRANCH_LIMIT") throw new Error("branch_limit");
          if (body?.code === "RECOVERY_TIMEOUT") throw new Error("timeout");
          if (response.status === 503) throw new Error("unavailable");
          throw new Error("failed");
        }
        const data = await response.json() as RecoveryPayload;
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        traceRecovery("2 - response GET /games/history/:id/recovered-pgn", data);
        if (typeof data.pgn !== "string" || !data.pgn.trim()) throw new Error("Recovery response did not include PGN");
        const bestMoveLists = Array.isArray(data.bestMoveLists)
          ? data.bestMoveLists.filter(isRecoveryLine)
          : [];
        const steps = Array.isArray(data.steps) ? data.steps.filter(isRecoveryStep) : [];
        const defaultRecoveryLine = bestMoveLists[0] ?? null;

        traceRecovery("3 - bestMoveLists[0] frontend chọn", {
          sanCount: defaultRecoveryLine?.sanMoves.length ?? 0,
          sanMoves: defaultRecoveryLine?.sanMoves ?? [],
          assumedFens: defaultRecoveryLine?.assumedFens ?? [],
        });
        setBasePgn(data.pgn);
        setRecoveryLines(bestMoveLists);
        setRecoverySteps(steps);
        setProcessedToInputIndexes(readProcessedIndexes(data.preprocessing));
        setSelectedSource("base");
        setRecoveryStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const reason = error instanceof Error ? error.message : "failed";
        setRecoveryStatus(reason === "branch_limit" || reason === "timeout" || reason === "unavailable" ? reason : "error");
      });

    return () => { cancelled = true; };
  }, [game._id, game.fenHistory]);

  const selectedRecoveryLine = typeof selectedSource === "number"
    ? recoveryLines[selectedSource] ?? null
    : null;

  const reviewPgn = useMemo(() => {
    if (selectedRecoveryLine) return recoveryLineToPgn(game, selectedRecoveryLine);
    if (game.fenHistory?.length) return basePgn ?? game.pgn ?? "";
    return game.pgn ?? "";
  }, [basePgn, game, selectedRecoveryLine]);
  const displayPgn = useMemo(() => formatPgnForDisplay(reviewPgn), [reviewPgn]);

  const timeline = useMemo(() => {
    const initialFen = game.initialFen ?? DEFAULT_FEN;
    const initial: ReviewMove = { fen: initialFen, san: "start", lastMove: null, originalPly: 0 };
    if (Array.isArray(game.fenHistory) && game.fenHistory.length > 0) {
      if (selectedSource !== "base" && (recoveryStatus !== "ready" || !reviewPgn)) {
        return [initial];
      }

      if (selectedSource === "base") {
        // The original FEN source must render the persisted snapshots exactly.
        // Do not replay the recovered/custom PGN here: malformed snapshots are
        // intentionally visible so users can inspect the raw board sequence.
        const out: ReviewMove[] = [initial];
        game.fenHistory.forEach((rawFen, index) => {
          const fen = typeof rawFen === "string" ? rawFen.trim() : "";
          if (!fen) return;
          const uci = game.uciHistory?.[index];
          const lastMove = uci && /^[a-h][1-8][a-h][1-8]/.test(uci)
            ? { from: uci.slice(0, 2), to: uci.slice(2, 4) }
            : null;
          out.push({
            fen,
            san: fen,
            lastMove,
            originalPly: index + 1,
          });
        });
        return out;
      }

      // A recovered branch is an independent legal game line. Rebuild every
      // board from its generated PGN instead of pairing it with original FENs.
      try {
        const parsed = new Chess();
        parsed.loadPgn(reviewPgn);
        const pgnStartFen = readPgnHeaders(reviewPgn).FEN || DEFAULT_FEN;
        const temp = new Chess(pgnStartFen, { skipValidation: true });
        const out: ReviewMove[] = [
          { fen: temp.fen(), san: "start", lastMove: null, originalPly: 0 },
        ];
        const moves = parsed.history({ verbose: true });
        moves.forEach((move, index) => {
          const applied = temp.move({ from: move.from, to: move.to, promotion: move.promotion });
          const step = recoverySteps[index];
          const moveSource = selectedRecoveryLine?.moveSources?.[index];
          const processedIndexes = step?.originalPly
            ? processedToInputIndexes[step.originalPly - 1] ?? []
            : [];
          out.push({
            fen: temp.fen(),
            san: move.san,
            lastMove: applied ? { from: applied.from, to: applied.to } : null,
            originalPly: processedIndexes.length > 0
              ? processedIndexes[0]! + 1
              : step?.originalPly ?? null,
            fenFallback: true,
            padding: step?.synthetic === true || moveSource === "padding_assumed",
            assumed: moveSource === "assumed" || moveSource === "retry_assumed",
            deduplicatedFenCount: processedIndexes.length > 1 ? processedIndexes.length : 0,
          });
        });
        return out;
      } catch {
        return [initial];
      }
    }
    // Records without FEN snapshots can only be displayed from the recovered
    // PGN text itself. This path is uncommon and still uses the sidecar PGN
    // whenever it was returned.
    try {
      const c = new Chess();
      c.loadPgn(reviewPgn);
      const temp = new Chess();
      const out: ReviewMove[] = [
        { fen: temp.fen(), san: "start", lastMove: null, originalPly: 0 },
      ];
      for (const [index, san] of c.history().entries()) {
        const move = temp.move(san);
        out.push({ fen: temp.fen(), san, lastMove: move ? { from: move.from, to: move.to } : null, originalPly: index + 1 });
      }
      if (out.length > 1) return out;
    } catch {}
    return [initial];
  }, [game, processedToInputIndexes, recoveryStatus, recoverySteps, reviewPgn, selectedRecoveryLine, selectedSource, t]);

  useEffect(() => {
    traceRecovery("4 - timeline frontend dùng để render", {
      selectedSource,
      count: Math.max(0, timeline.length - 1),
      moves: timeline.slice(1).map((move, index) => ({
        ply: index + 1,
        san: move.san,
        fen: move.fen,
        durationMs: move.originalPly ? game.moveDurationsMs?.[move.originalPly - 1] ?? null : null,
      })),
    });
  }, [game.moveDurationsMs, selectedSource, timeline]);

  const currentIndex = cursor === -1 ? timeline.length - 1 : Math.max(0, Math.min(cursor, timeline.length - 1));
  const current = timeline[currentIndex];
  const reviewRows = useMemo(() => {
    type ReviewCell = { move: ReviewMove; ply: number; side: "w" | "b"; number: number };
    const rows: Array<{ number: number; white?: ReviewCell; black?: ReviewCell }> = [];
    const initialFields = (timeline[0]?.fen ?? "").trim().split(/\s+/);
    const initialSide: "w" | "b" = initialFields[1] === "b" ? "b" : "w";
    const initialNumber = Number(initialFields[5]);
    const baseNumber = Number.isInteger(initialNumber) && initialNumber > 0 ? initialNumber : 1;
    timeline.slice(1).forEach((move, index) => {
      const ply = index + 1;
      const beforeFen = timeline[ply - 1]?.fen ?? "";
      const fields = beforeFen.trim().split(/\s+/);
      const side: "w" | "b" = fields[1] === "b" ? "b" : "w";
      // FEN fullmove counters from recovered/legacy data may repeat or be invalid.
      // Number the displayed PGN by ply order so every move remains sequential.
      const number = baseNumber + Math.floor((ply + (initialSide === "b" ? 0 : -1)) / 2);
      let row = rows[rows.length - 1];
      const occupied = row && (side === "w" ? row.white : row.black);
      if (!row || row.number !== number || occupied) {
        row = { number };
        rows.push(row);
      }
      if (side === "w") row.white = { move, ply, side, number };
      else row.black = { move, ply, side, number };
    });
    return rows;
  }, [timeline]);
  const reviewCells = useMemo(
    () => reviewRows.flatMap((row) => [row.white, row.black].filter((cell): cell is NonNullable<typeof cell> => Boolean(cell))),
    [reviewRows],
  );
  const branchAnalysis = typeof selectedSource === "number"
    ? branchAnalysisBySource[String(selectedSource)] ?? []
    : [];
  const selectedAnalysisByPly = selectedSource === "base"
    ? analysisByPly
    : new Map(branchAnalysis.map((move) => [move.ply, move]));
  const currentMoveAnalysis = selectedAnalysisByPly.get(
    selectedSource === "base" ? current.originalPly ?? currentIndex : currentIndex,
  );
  const analysisGame = useMemo<HistoryGame>(() => {
    if (!selectedRecoveryLine?.assumedFens?.length) return game;
    return {
      ...game,
      fenHistory: selectedRecoveryLine.assumedFens,
      uciHistory: selectedRecoveryLine.uciMoves,
      initialFen: game.initialFen ?? DEFAULT_FEN,
    };
  }, [game, selectedRecoveryLine]);
  const analyzedDestination = current.lastMove?.to || currentMoveAnalysis?.uci?.slice(2, 4) || "";
  const boardMoveAnnotation = selectedSource !== "base" && currentMoveAnalysis && currentMoveAnalysis.classification !== "unavailable" && /^[a-h][1-8]$/.test(analyzedDestination)
    ? {
        square: analyzedDestination,
        classification: currentMoveAnalysis.classification,
        label: t(`analysis.${currentMoveAnalysis.classification}`),
      }
    : null;
  const recoveryNotice = selectedSource !== "base" && game.fenHistory?.length && recoveryStatus !== "ready"
    ? recoveryStatus === "loading"
      ? t("rev.loading")
      : recoveryStatus === "branch_limit"
        ? t("rev.recoveryBranchLimit")
        : recoveryStatus === "timeout"
          ? t("rev.recoveryTimeout")
          : recoveryStatus === "unavailable"
            ? t("pg.recoveryUnavailable")
            : t("pg.recoveryError")
    : "";

  const branchDifferences = useMemo(() => recoveryLines.map((line, lineIndex) => {
    for (let plyIndex = 0; plyIndex < line.sanMoves.length; plyIndex++) {
      const differs = recoveryLines.some((candidate, candidateIndex) =>
        candidateIndex !== lineIndex && candidate.sanMoves[plyIndex] !== line.sanMoves[plyIndex]
      );
      if (differs) return { ply: plyIndex + 1, move: line.sanMoves[plyIndex]! };
    }
    return null;
  }), [recoveryLines]);

  const selectReviewSource = useCallback((source: ReviewSource) => {
    if (source === selectedSource) return;
    setCursor(currentIndex);
    setSelectedSource(source);
  }, [currentIndex, selectedSource]);

  // Analyze the position currently selected by this viewer. This is kept
  // separate from persisted game analysis so each client can step through a
  // different branch without changing shared data.
  const {
    workerRef: reviewWorkerRef,
    onMessageRef: reviewMessageRef,
    isReady: reviewEngineReady,
    hasError: reviewEngineError,
  } = useStockfish(showHistoryEvaluation || showHistorySuggestions);
  const [reviewCp, setReviewCp] = useState<number | null>(null);
  const [reviewMate, setReviewMate] = useState<number | null>(null);
  const [reviewBestMove, setReviewBestMove] = useState<string | null>(null);
  const [reviewAnalyzing, setReviewAnalyzing] = useState(false);
  const reviewSearchRef = useRef<{ fen: string; depth: number } | null>(null);
  const reviewSearchTimerRef = useRef<number | null>(null);

  useEffect(() => {
    reviewMessageRef.current = (line: string) => {
      const active = reviewSearchRef.current;
      if (line.startsWith("bestmove")) {
        if (!active || active.fen !== current.fen) return;
        const bestMove = line.trim().split(/\s+/)[1] ?? null;
        setReviewBestMove(showHistorySuggestions && bestMove && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove) ? bestMove : null);
        setReviewAnalyzing(false);
        return;
      }
      if (!active || active.fen !== current.fen || !line.startsWith("info ")) return;
      const depthMatch = line.match(/\bdepth (\d+)/);
      const depth = depthMatch ? Number(depthMatch[1]) : -1;
      if (depth < active.depth) return;
      active.depth = depth;
      const blackToMove = active.fen.split(" ")[1] === "b";
      const cpMatch = line.match(/\bscore cp (-?\d+)/);
      if (cpMatch) {
        const value = Number(cpMatch[1]);
        if (showHistoryEvaluation) setReviewCp(blackToMove ? -value : value);
        setReviewMate(null);
        return;
      }
      const mateMatch = line.match(/\bscore mate (-?\d+)/);
      if (mateMatch) {
        const value = Number(mateMatch[1]);
        if (showHistoryEvaluation) setReviewMate(blackToMove ? -value : value);
        setReviewCp(null);
      }
    };
    return () => { reviewMessageRef.current = null; };
  }, [current.fen, reviewMessageRef, showHistoryEvaluation, showHistorySuggestions]);

  useEffect(() => {
    const worker = reviewWorkerRef.current;
    const safeFen = current.fen !== "start" && isEngineSafeFen(current.fen);
    if (reviewSearchTimerRef.current !== null) {
      window.clearTimeout(reviewSearchTimerRef.current);
      reviewSearchTimerRef.current = null;
    }
    const engineEnabled = showHistoryEvaluation || showHistorySuggestions;
    if (!engineEnabled || !reviewEngineReady || !worker || !safeFen) {
      reviewSearchRef.current = null;
      setReviewCp(null);
      setReviewMate(null);
      setReviewBestMove(null);
      setReviewAnalyzing(false);
      return;
    }

    worker.postMessage("stop");
    setReviewAnalyzing(true);
    const fenToAnalyze = current.fen;
    reviewSearchTimerRef.current = window.setTimeout(() => {
      reviewSearchTimerRef.current = null;
      reviewSearchRef.current = { fen: fenToAnalyze, depth: -1 };
      setReviewCp(null);
      setReviewMate(null);
      setReviewBestMove(null);
      worker.postMessage(`position fen ${fenToAnalyze}`);
      worker.postMessage("go depth 16");
    }, 220);
    return () => {
      worker.postMessage("stop");
      if (reviewSearchTimerRef.current !== null) {
        window.clearTimeout(reviewSearchTimerRef.current);
        reviewSearchTimerRef.current = null;
      }
      reviewSearchRef.current = null;
    };
  }, [current.fen, reviewEngineReady, reviewWorkerRef, showHistoryEvaluation, showHistorySuggestions]);

  const reviewPredictedMove = useMemo<PredictedMove | null>(() => {
    if (!showHistorySuggestions || !reviewBestMove) return null;
    return {
      from: reviewBestMove.slice(0, 2) as PredictedMove["from"],
      to: reviewBestMove.slice(2, 4) as PredictedMove["to"],
    };
  }, [reviewBestMove, showHistorySuggestions]);

  useEffect(() => {
    setCursor(-1);
    setSelectedSource("base");
    setBaseAnalysisMoves(game.analysis?.moves ?? []);
    setBranchAnalysisBySource({});
  }, [game?._id, game.analysis?.moves]);

  useEffect(() => {
    setShowHistoryEvaluation(localStorage.getItem("history-show-evaluation") !== "false");
    setShowHistorySuggestions(localStorage.getItem("history-show-suggestions") !== "false");
  }, []);

  const toggleHistoryEvaluation = () => {
    setShowHistoryEvaluation((visible) => {
      localStorage.setItem("history-show-evaluation", String(!visible));
      return !visible;
    });
  };

  const toggleHistorySuggestions = () => {
    setShowHistorySuggestions((visible) => {
      localStorage.setItem("history-show-suggestions", String(!visible));
      return !visible;
    });
  };

  const handleAnalysisSaved = useCallback((moves: MoveAnalysis[]) => {
    if (selectedSource === "base") {
      setBaseAnalysisMoves(moves);
      return;
    }
    setBranchAnalysisBySource((previous) => ({
      ...previous,
      [String(selectedSource)]: moves,
    }));
  }, [selectedSource]);

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
      await navigator.clipboard.writeText(displayPgn);
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

  /** Deletes only the selected persisted FEN snapshot after admin confirmation. */
  const deleteFenSnapshot = async () => {
    if (pendingFenIndex === null || !token || deletingFen) return;
    setDeletingFen(true);
    setFenDeleteError(null);
    try {
      const response = await fetch(
        `/games/history/${encodeURIComponent(game._id)}/fens/${pendingFenIndex}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      const body = await response.json().catch(() => null) as { fenHistory?: unknown } | null;
      if (!response.ok || !Array.isArray(body?.fenHistory)) throw new Error("delete_failed");
      const fenHistory = body.fenHistory.filter((fen): fen is string => typeof fen === "string");
      setBaseAnalysisMoves([]);
      setPendingFenIndex(null);
      onGameUpdate?.({ ...game, fenHistory, analysis: undefined });
    } catch {
      setFenDeleteError(t("rev.deleteFenFailed"));
    } finally {
      setDeletingFen(false);
    }
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
              {t(`timeControl.${resolveTimeControlType(game.initialTimeMs, game.incrementMs, game.timeControlType)}` as "timeControl.blitz" | "timeControl.rapid" | "timeControl.classical")}
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
          <div className="flex flex-nowrap justify-end gap-2 overflow-x-auto">
            <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 whitespace-nowrap" onClick={toggleHistoryEvaluation}>
              <BarChart3 className="size-3.5" />
              {showHistoryEvaluation ? t("rev.hideEvaluation") : t("rev.showEvaluation")}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 whitespace-nowrap" onClick={toggleHistorySuggestions}>
              {showHistorySuggestions ? <EyeOff className="size-3.5" /> : <Lightbulb className="size-3.5" />}
              {showHistorySuggestions ? t("rev.hideSuggestionsOnly") : t("rev.showSuggestionsOnly")}
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(320px,520px)_1fr]">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex min-w-0 items-stretch gap-1.5">
                <div
                  ref={boardWrapRef}
                  className="min-w-0 flex-1 select-none overscroll-contain"
                  title={t("rev.wheelNavigation")}
                >
                  <ChessBoardView
                    fen={current.fen}
                    lastMove={current.lastMove}
                    boardWidth={boardWidth}
                    moveAnnotation={boardMoveAnnotation}
                    predictedMove={reviewPredictedMove}
                  />
                </div>
                {showHistoryEvaluation && (
                  <div className="hidden w-[22px] shrink-0 sm:block">
                    <EvalBar
                      cp={reviewCp}
                      mate={reviewMate}
                      isAnalyzing={reviewAnalyzing}
                      engineUnavailable={reviewEngineError || !isEngineSafeFen(current.fen)}
                    />
                  </div>
                )}
              </div>
              {showHistoryEvaluation && (
                <div className="sm:hidden">
                  <EvalBar
                    cp={reviewCp}
                    mate={reviewMate}
                    isAnalyzing={reviewAnalyzing}
                    engineUnavailable={reviewEngineError || !isEngineSafeFen(current.fen)}
                    orientation="horizontal"
                  />
                </div>
              )}
            </div>
            <div className="flex h-[420px] min-h-0 flex-col overflow-hidden rounded-sm border border-border bg-muted/50 xl:h-[520px]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">{t("rev.moveReview")}</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {t("rev.plyProgress", { current: currentIndex, total: timeline.length - 1 })}
                </span>
              </div>
              <div className="flex items-center justify-center gap-3 border-b border-border p-3">
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
              {!!game.fenHistory?.length && (
                <div className="space-y-1.5 border-b border-border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("rev.reviewSource")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {t("rev.sourceCount", { count: recoveryStatus === "ready" ? recoveryLines.length + 1 : 1 })}
                    </span>
                  </div>
                  <select
                    value={selectedSource === "base" ? "base" : String(selectedSource)}
                    onChange={(event) => selectReviewSource(event.target.value === "base" ? "base" : Number(event.target.value))}
                    aria-label={t("rev.chooseReviewSource")}
                    className="h-9 w-full truncate rounded-sm border border-input bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
                  >
                    <option value="base">
                      {t("rev.basePgn")} · {t("rev.plyCount", { count: game.fenHistory.length })}
                    </option>
                    {recoveryStatus === "ready" && recoveryLines.map((line, index) => {
                      const difference = branchDifferences[index];
                      return (
                        <option key={`recovery-source-${index}`} value={index}>
                          {t("rev.recoveryBranch", { number: index + 1 })} · {t("rev.plyCount", { count: line.sanMoves.length })}
                          {difference ? ` · ${t("rev.branchDifference", difference)}` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-1.5 p-2">
                  {recoveryNotice && (
                    <p className="col-span-full p-3 text-xs text-muted-foreground">
                      {recoveryNotice}
                    </p>
                  )}
                  {reviewCells.map((cell) => {
                    const { move: m, ply, side, number } = cell;
                    const moveDuration = m.originalPly
                      ? game.moveDurationsMs?.[m.originalPly - 1]
                      : undefined;
                    const notes = [
                      m.padding ? t("rev.paddingNote") : null,
                      m.assumed ? t("rev.assumedNote") : null,
                      m.deduplicatedFenCount
                        ? t("rev.deduplicatedFenNote", { count: m.deduplicatedFenCount })
                        : null,
                    ].filter((note): note is string => Boolean(note));
                    return (
                      <button
                        key={`${m.san}-${ply}`}
                        ref={currentIndex === ply ? activeMoveRef : undefined}
                        type="button"
                        onClick={() => goTo(ply)}
                        className={`w-full min-h-9 rounded-sm border px-3 py-2 text-left ${m.fenFallback ? "font-mono text-xs" : "text-sm"} transition-colors ${m.fenFallback
                          ? currentIndex === ply ? "border-primary/40 bg-primary/10 text-foreground" : "border-warning/30 bg-warning/5 text-muted-foreground hover:bg-warning/10"
                          : currentIndex === ply ? "border-border bg-accent text-foreground" : "border-transparent text-muted-foreground hover:bg-accent/70"}`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className={selectedSource === "base" ? "min-w-0 whitespace-pre-wrap break-all font-mono text-[11px] leading-5" : "min-w-0 truncate"}>
                            {selectedSource === "base" ? m.fen : `${number}${side === "w" ? "." : "..."} ${m.san}${notes.length > 0 ? ` (${notes.join(", ")})` : ""}`}
                          </span>
                          {selectedSource !== "base" && (
                            <span
                              className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground"
                              title={t("rev.moveDuration")}
                              aria-label={`${t("rev.moveDuration")}: ${formatMoveDuration(moveDuration)}`}
                            >
                              {formatMoveDuration(moveDuration)}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
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
              {displayPgn ? movesOnly(displayPgn) : recoveryNotice}
            </pre>
          </ScrollArea>

          {/* Full PGN collapsible */}
          {displayPgn && <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium select-none">
              {t("rev.showFullPgn")}
            </summary>
            <ScrollArea className="mt-2 h-44 rounded-sm border border-border bg-muted">
              <pre className="p-3 font-mono text-xs text-foreground whitespace-pre-wrap break-words">
                {displayPgn}
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
                      <div key={`fh-${i}`} className="group flex items-center gap-2 font-mono text-xs border border-border/60 rounded-sm px-2.5 py-1.5">
                        <span className="min-w-0 flex-1 break-all">
                          <span className="text-muted-foreground mr-2">{i + 1}.</span>{f}
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            title={t("rev.deleteFen")}
                            aria-label={t("rev.deleteFenPosition", { number: i + 1 })}
                            onClick={() => { setFenDeleteError(null); setPendingFenIndex(i); }}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
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
        <MoveAnalysisPanel
          game={game}
          // The original source uses persisted analysis; only a selected
          // recovery branch receives a client-local analysis timeline.
          analysisGame={selectedSource === "base" ? undefined : analysisGame}
          currentPly={currentIndex}
          onSelectPly={goTo}
          onAnalysisSaved={handleAnalysisSaved}
        />
        <Dialog open={pendingFenIndex !== null} onOpenChange={(open) => !open && !deletingFen && setPendingFenIndex(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("rev.deleteFenTitle")}</DialogTitle>
              <DialogDescription>
                {t("rev.deleteFenDescription", { number: (pendingFenIndex ?? 0) + 1 })}
              </DialogDescription>
            </DialogHeader>
            {fenDeleteError && <p className="px-5 py-3 text-sm text-destructive">{fenDeleteError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendingFenIndex(null)} disabled={deletingFen}>
                {t("played.cancel")}
              </Button>
              <Button variant="destructive" onClick={() => void deleteFenSnapshot()} disabled={deletingFen}>
                {deletingFen ? t("rev.deletingFen") : t("rev.deleteFen")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
