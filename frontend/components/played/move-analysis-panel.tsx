"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useT } from "@/lib/i18n";
import { analyzeHistoryMoves, type MoveAnalysis } from "@/lib/post-game-analysis";
import { moveClassificationMark, moveClassificationTone } from "@/lib/move-classification";
import type { HistoryGame } from "@/types/game.types";
import { calculateGameAccuracy } from "@/lib/accuracy";

interface Props {
  game: HistoryGame;
  /** Optional selected source. When present, analysis uses only its FEN timeline. */
  analysisGame?: HistoryGame;
  currentPly: number;
  onSelectPly: (ply: number) => void;
  onAnalysisSaved?: (moves: MoveAnalysis[]) => void;
}

function formatEvaluation(value: number | null): string {
  if (value === null) return "—";
  if (Math.abs(value) >= 100_000) return value > 0 ? "+#" : "-#";
  return `${value >= 0 ? "+" : ""}${(value / 100).toFixed(1)}`;
}

export function MoveAnalysisPanel({ game, analysisGame, currentPly, onSelectPly, onAnalysisSaved }: Props) {
  const { t } = useT();
  const [moves, setMoves] = useState<MoveAnalysis[]>(game.analysis?.moves ?? []);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const activeAnalysisKeyRef = useRef("");
  const analysisPromisesRef = useRef(new Map<string, Promise<MoveAnalysis[]>>());
  const chartConfig = { evaluation: { label: t("analysis.advantage"), color: "hsl(var(--primary))" } } satisfies ChartConfig;
  const chartData = moves.map((move) => ({
    ...move,
    evaluation: move.evaluationAfterCp === null ? null : Math.max(-12, Math.min(12, move.evaluationAfterCp / 100)),
  }));
  const selected = moves.find((move) => move.ply === currentPly) ?? moves.at(-1);

  const sourceGame = analysisGame ?? game;
  const analysisKey = `${game._id}|${sourceGame.fenHistory?.join("|") ?? ""}`;

  useEffect(() => {
    let cancelled = false;
    let ownsPendingAnalysis = false;
    let analysisSettled = false;
    const controller = new AbortController();
    activeAnalysisKeyRef.current = analysisKey;
    setError(null);
    setProgress({ completed: 0, total: 0 });
    setMoves([]);
    onAnalysisSaved?.([]);

    const hasMoves = (sourceGame.fenHistory?.length ?? 0) >= 2;
    if (!hasMoves) {
      setRunning(false);
      return () => { cancelled = true; };
    }

    setRunning(true);
    let analysisPromise = analysisPromisesRef.current.get(analysisKey);
    if (!analysisPromise) {
      ownsPendingAnalysis = true;
      analysisPromise = analyzeHistoryMoves(sourceGame, (completed, total) => {
        if (!cancelled && activeAnalysisKeyRef.current === analysisKey) {
          setProgress({ completed, total });
        }
      }, 14, controller.signal);
      analysisPromisesRef.current.set(analysisKey, analysisPromise);
    }

    void analysisPromise
      .then((result) => {
        if (cancelled || activeAnalysisKeyRef.current !== analysisKey) return;
        setMoves(result);
        onAnalysisSaved?.(result);
      })
      .catch(() => {
        analysisPromisesRef.current.delete(analysisKey);
        if (!cancelled && !controller.signal.aborted && activeAnalysisKeyRef.current === analysisKey) {
          setError(t("analysis.error"));
        }
      })
      .finally(() => {
        analysisSettled = true;
        if (!cancelled && activeAnalysisKeyRef.current === analysisKey) setRunning(false);
      });

    return () => {
      cancelled = true;
      if (ownsPendingAnalysis && !analysisSettled) {
        controller.abort();
        analysisPromisesRef.current.delete(analysisKey);
      }
    };
  }, [analysisKey, onAnalysisSaved, sourceGame, t]);

  const accuracy = useMemo(() => calculateGameAccuracy(moves), [moves]);

  return (
    <section className="px-4 sm:px-5 pb-5 space-y-2">
      <div><h3 className="text-sm font-medium">{t("analysis.title")}</h3></div>
      {running && <p className="text-xs text-muted-foreground">{t("analysis.progress", { completed: progress.completed, total: progress.total })}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!!moves.length && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-sm border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              {game.whiteName || t("common.white")}
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold">
              {accuracy.white === null
                ? "—"
                : accuracy.white.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("analysis.accuracy")}
            </p>
          </div>

          <div className="rounded-sm border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              {game.blackName || t("common.black")}
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold">
              {accuracy.black === null
                ? "—"
                : accuracy.black.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("analysis.accuracy")}
            </p>
          </div>
        </div>
      )}
      {!running && !moves.length && <div className="rounded-sm border border-dashed border-border bg-muted/40 px-3 py-4 text-xs text-muted-foreground">{t("analysis.empty")}</div>}
      {!!moves.length && <ScrollArea className="h-56 rounded-sm border border-border bg-muted/40"><div className="divide-y divide-border">
        {moves.map((move) => {
          return <button key={move.ply} type="button" onClick={() => onSelectPly(move.ply)} className={`grid w-full grid-cols-[3rem_minmax(4rem,1fr)_minmax(5rem,auto)] items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${move.ply === currentPly ? "bg-accent/70" : "hover:bg-accent/40"}`}>
            <span className="font-mono text-muted-foreground">{move.ply}.</span><span className="font-medium">{move.san}</span>
            <span className={`inline-flex items-center gap-1 justify-self-end rounded-sm border px-1.5 py-0.5 font-medium ${moveClassificationTone[move.classification]}`}>
              <span className="min-w-4 text-center font-bold" aria-hidden="true">{moveClassificationMark[move.classification]}</span>
              {t(`analysis.${move.classification}`)}
            </span>
          </button>;
        })}
      </div></ScrollArea>}
      {!!moves.length && <>
        <div className="rounded-sm border border-border bg-muted/30 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium">{t("analysis.advantage")}</span>
            <span className="font-mono text-muted-foreground">{t("analysis.currentPly", { ply: selected?.ply ?? 0 })}</span>
          </div>
          <ChartContainer config={chartConfig} className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} onClick={(state: unknown) => {
                const index = (state as { activeTooltipIndex?: number | string }).activeTooltipIndex;
                const point = typeof index === "number" ? chartData[index] : undefined;
                if (point) onSelectPly(point.ply);
              }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="ply" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis domain={[-12, 12]} tickLine={false} axisLine={false} fontSize={11} width={30} />
                <ReferenceLine y={0} className="stroke-muted-foreground/50" />
                <Area type="monotone" dataKey="evaluation" stroke="var(--color-evaluation)" fill="var(--color-evaluation)" fillOpacity={0.18} strokeWidth={2} activeDot={{ r: 5 }} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => <><span>{t("analysis.evaluation")}</span><span className="font-mono">{typeof value === "number" ? value.toFixed(1) : "—"}</span></>} />} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>
        {selected && <div className="grid gap-2 rounded-sm border border-border bg-muted/30 p-3 text-xs sm:grid-cols-3">
          <div><p className="text-muted-foreground">{t("analysis.playedMove")}</p><p className="mt-1 font-medium">{selected.san}</p></div>
          <div><p className="text-muted-foreground">{t("analysis.bestMove")}</p><p className="mt-1 font-mono font-medium">{selected.bestMove || "—"}</p></div>
          <div><p className="text-muted-foreground">{t("analysis.evaluation")}</p><p className="mt-1 font-mono font-medium">{formatEvaluation(selected.evaluationAfterCp)}</p></div>
          <div className="sm:col-span-3"><p className="text-muted-foreground">{t("analysis.principalVariation")}</p><p className="mt-1 break-words font-mono text-foreground">{selected.principalVariation?.join(" ") || "—"}</p></div>
        </div>}
      </>}
    </section>
  );
}
