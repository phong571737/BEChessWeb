"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { analyzePgnMoves, type MoveAnalysis } from "@/lib/post-game-analysis";
import type { HistoryGame } from "@/types/game.types";

interface Props { game: HistoryGame; pgn: string; }

const tone: Record<MoveAnalysis["classification"], string> = {
  brilliant: "border-accent/40 bg-accent text-accent-foreground", best: "border-success/40 bg-success/10 text-success",
  excellent: "border-info/40 bg-info/10 text-info", good: "border-border bg-muted text-foreground",
  inaccuracy: "border-warning/40 bg-warning/10 text-warning", mistake: "border-warning/60 bg-warning/15 text-warning",
  blunder: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function MoveAnalysisPanel({ game, pgn }: Props) {
  const { t } = useT();
  const { isAdmin, token } = useAuth();
  const [moves, setMoves] = useState<MoveAnalysis[]>(game.analysis?.moves ?? []);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [failed, setFailed] = useState(false);

  useEffect(() => { setMoves(game.analysis?.moves ?? []); setRunning(false); setFailed(false); }, [game._id, game.analysis]);

  const runAnalysis = async () => {
    if (!token || running) return;
    setRunning(true); setFailed(false);
    try {
      const result = await analyzePgnMoves(pgn, (completed, total) => setProgress({ completed, total }));
      if (!result.length) return;
      const response = await fetch(`/games/history/${encodeURIComponent(game._id)}/analysis`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ moves: result, depth: 14 }),
      });
      if (!response.ok) throw new Error("Unable to save game analysis");
      setMoves(result);
    } catch { setFailed(true); } finally { setRunning(false); }
  };

  return (
    <section className="px-4 sm:px-5 pb-5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-sm font-medium">{t("analysis.title")}</h3><p className="text-xs text-muted-foreground">{t("analysis.description")}</p></div>
        {isAdmin && <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={runAnalysis} disabled={running}>
          {running ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />}
          {running ? t("analysis.running") : moves.length ? t("analysis.reanalyze") : t("analysis.run")}
        </Button>}
      </div>
      {running && <p className="text-xs text-muted-foreground">{t("analysis.progress", { completed: progress.completed, total: progress.total })}</p>}
      {failed && <p className="text-xs text-destructive">{t("analysis.error")}</p>}
      {!running && !moves.length && <div className="rounded-sm border border-dashed border-border bg-muted/40 px-3 py-4 text-xs text-muted-foreground">{t("analysis.empty")}</div>}
      {!!moves.length && <ScrollArea className="h-56 rounded-sm border border-border bg-muted/40"><div className="divide-y divide-border">
        {moves.map((move) => <div key={move.ply} className="grid grid-cols-[3rem_minmax(4rem,1fr)_minmax(5rem,auto)] items-center gap-2 px-3 py-2 text-xs">
          <span className="font-mono text-muted-foreground">{move.ply}.</span><span className="font-medium">{move.san}</span>
          <span className={`justify-self-end rounded-sm border px-1.5 py-0.5 font-medium ${tone[move.classification]}`}>{t(`analysis.${move.classification}`)}</span>
        </div>)}
      </div></ScrollArea>}
    </section>
  );
}
