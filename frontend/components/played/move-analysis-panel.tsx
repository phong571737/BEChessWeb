"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrainCircuit, LoaderCircle } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { analyzeHistoryMoves, type MoveAnalysis } from "@/lib/post-game-analysis";
import { moveClassificationMark, moveClassificationTone } from "@/lib/move-classification";
import type { HistoryGame } from "@/types/game.types";

interface Props {
  game: HistoryGame;
  /** Optional recovered source. When present, analysis must use its FEN/UCI timeline. */
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
  const { token } = useAuth();
  const [moves, setMoves] = useState<MoveAnalysis[]>(game.analysis?.moves ?? []);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const analysisRunRef = useRef(0);
  const runningRef = useRef(false);
  const chartConfig = { evaluation: { label: t("analysis.advantage"), color: "hsl(var(--primary))" } } satisfies ChartConfig;
  const chartData = moves.map((move) => ({
    ...move,
    evaluation: move.evaluationAfterCp === null ? null : Math.max(-12, Math.min(12, move.evaluationAfterCp / 100)),
  }));
  const selected = moves.find((move) => move.ply === currentPly) ?? moves.at(-1);

  const branchKey = analysisGame?.fenHistory?.length
    ? `${analysisGame.initialFen ?? ""}|${analysisGame.fenHistory.join("|")}|${analysisGame.uciHistory?.join("|") ?? ""}`
    : "persisted";

  const runAnalysis = useCallback(async (automatic = false) => {
    if (runningRef.current) return;
    const runId = ++analysisRunRef.current;
    runningRef.current = true;
    setRunning(true); setError(null);
    try {
      const result = await analyzeHistoryMoves(analysisGame ?? game, (completed, total) => setProgress({ completed, total }));
      if (!result.length) return;
      // Branch analysis is intentionally client-local. Persisting it against
      // the game would make one viewer's selected recovery line overwrite
      // another viewer's line. Only the original, non-branch game may save.
      if (token && !analysisGame?.fenHistory?.length) {
        const response = await fetch(`/games/history/${encodeURIComponent(game._id)}/analysis`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ moves: result, depth: 14 }),
        });
        if (response.ok) {
          // The local result is still used immediately below.
        }
      }
      if (runId !== analysisRunRef.current) return;
      setMoves(result);
      onAnalysisSaved?.(result);
    } catch { setError(t("analysis.error")); } finally { runningRef.current = false; setRunning(false); }
  }, [analysisGame, game, onAnalysisSaved, t, token]);

  useEffect(() => {
    analysisRunRef.current += 1;
    setError(null);
    setProgress({ completed: 0, total: 0 });
    if (branchKey !== "persisted") {
      setMoves([]);
      void runAnalysis(true);
    } else {
      const savedMoves = game.analysis?.moves ?? [];
      setMoves(savedMoves);
      const hasGameMoves = Boolean(
        game.uciHistory?.length
        || game.fenHistory?.length
        || game.totalMoves
        || game.pgn?.trim(),
      );
      if (!savedMoves.length && hasGameMoves) {
        void runAnalysis(true);
      } else {
        setRunning(false);
      }
    }
  }, [branchKey, game.analysis, game._id, runAnalysis]);

  return (
    <section className="px-4 sm:px-5 pb-5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-sm font-medium">{t("analysis.title")}</h3><p className="text-xs text-muted-foreground">{t("analysis.description")}</p></div>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void runAnalysis(false)} disabled={running}>
          {running ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />}
          {running ? t("analysis.running") : moves.length ? t("analysis.reanalyze") : t("analysis.run")}
        </Button>
      </div>
      {running && <p className="text-xs text-muted-foreground">{t("analysis.progress", { completed: progress.completed, total: progress.total })}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
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
