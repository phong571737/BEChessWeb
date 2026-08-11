"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useT } from "@/lib/i18n";
import type { MoveClassification } from "@/lib/post-game-analysis";
import type { HistoryGame } from "@/types/game.types";

const classifications: MoveClassification[] = [
  "brilliant",
  "best",
  "excellent",
  "good",
  "inaccuracy",
  "mistake",
  "blunder",
];

const tone: Record<MoveClassification, string> = {
  brilliant: "border-accent/40 bg-accent text-accent-foreground",
  best: "border-success/40 bg-success/10 text-success",
  excellent: "border-info/40 bg-info/10 text-info",
  good: "border-border bg-muted text-foreground",
  inaccuracy: "border-warning/40 bg-warning/10 text-warning",
  mistake: "border-warning/60 bg-warning/15 text-warning",
  blunder: "border-destructive/40 bg-destructive/10 text-destructive",
  unavailable: "border-border bg-muted text-muted-foreground",
};

/** Summarizes the persisted Stockfish labels without reparsing legacy PGN data. */
export function MatchAnalysis({ game }: { game: HistoryGame }) {
  const { t } = useT();
  const chartConfig = {
    white: { label: t("played.white"), color: "hsl(var(--primary))" },
    black: { label: t("played.black"), color: "hsl(var(--destructive))" },
  } satisfies ChartConfig;
  const summary = useMemo(() => {
    const moves = game.analysis?.moves ?? [];
    const counts = Object.fromEntries(
      [...classifications, "unavailable"].map((classification) => [
        classification,
        { white: 0, black: 0, total: 0 },
      ]),
    ) as Record<MoveClassification, { white: number; black: number; total: number }>;

    for (const move of moves) {
      const bucket = counts[move.classification] ?? counts.unavailable;
      const side = move.ply % 2 === 1 ? "white" : "black";
      bucket[side] += 1;
      bucket.total += 1;
    }

    return {
      counts,
      total: moves.length,
      analyzed: moves.length - counts.unavailable.total,
    };
  }, [game.analysis?.moves]);
  const chartData = classifications.map((classification) => ({
    classification: t(`analysis.${classification}`),
    white: summary.counts[classification].white,
    black: summary.counts[classification].black,
  }));

  return (
    <div className="space-y-3 p-4 sm:p-5">
      <div>
        <h3 className="text-sm font-semibold">{t("rev.analysis")}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("rev.stockfishSummaryDescription")}</p>
      </div>

      {summary.total === 0 ? (
        <Card>
          <CardContent className="flex min-h-36 items-center justify-center p-5 text-center text-sm text-muted-foreground">
            {t("analysis.empty")}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{t("rev.analyzedPlies")}</p>
                <p className="text-lg font-semibold">{summary.analyzed}</p>
              </CardContent>
            </Card>
            {classifications.map((classification) => (
              <Card key={classification} className={tone[classification]}>
                <CardContent className="p-3">
                  <p className="text-xs opacity-80">{t(`analysis.${classification}`)}</p>
                  <p className="text-lg font-semibold">{summary.counts[classification].total}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>{t("rev.stockfishBreakdown")}</CardTitle>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-primary" />{t("played.white")}</span>
                  <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-destructive" />{t("played.black")}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ChartContainer config={chartConfig} className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" barGap={4} margin={{ left: 8, right: 20 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="classification" width={105} tickLine={false} axisLine={false} fontSize={11} />
                    <Bar dataKey="white" fill="var(--color-white)" radius={[0, 3, 3, 0]} maxBarSize={18} />
                    <Bar dataKey="black" fill="var(--color-black)" radius={[0, 3, 3, 0]} maxBarSize={18} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
              {summary.counts.unavailable.total > 0 && (
                <div className="flex items-center justify-between rounded-sm border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                  <span>{t("analysis.unavailable")}</span>
                  <span className="font-mono font-semibold">{summary.counts.unavailable.total}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
