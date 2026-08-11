"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
              <CardTitle>{t("rev.stockfishBreakdown")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-[minmax(7rem,1fr)_4rem_4rem] gap-3 px-3 text-xs text-muted-foreground sm:grid-cols-[minmax(9rem,1fr)_5rem_5rem]">
                <span>{t("rev.classification")}</span>
                <span className="text-center">{t("played.white")}</span>
                <span className="text-center">{t("played.black")}</span>
              </div>
              {classifications.map((classification) => {
                const count = summary.counts[classification];
                const maximum = Math.max(1, summary.analyzed);
                return (
                  <div key={classification} className="grid grid-cols-[minmax(7rem,1fr)_4rem_4rem] items-center gap-3 rounded-sm border border-border bg-muted/30 px-3 py-2 sm:grid-cols-[minmax(9rem,1fr)_5rem_5rem]">
                    <div className="min-w-0">
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                        <span className={`rounded-sm border px-1.5 py-0.5 font-medium ${tone[classification]}`}>{t(`analysis.${classification}`)}</span>
                        <span className="font-mono text-muted-foreground">{count.total}</span>
                      </div>
                      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                        <span className="bg-state-white" style={{ width: `${(count.white / maximum) * 100}%` }} />
                        <span className="bg-state-black" style={{ width: `${(count.black / maximum) * 100}%` }} />
                      </div>
                    </div>
                    <span className="text-center font-mono text-sm font-semibold">{count.white}</span>
                    <span className="text-center font-mono text-sm font-semibold">{count.black}</span>
                  </div>
                );
              })}
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
