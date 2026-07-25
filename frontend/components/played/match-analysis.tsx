"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, XAxis, YAxis, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { HistoryGame } from "@/types/game.types";
import { useT } from "@/lib/i18n";
import { analyzeMatch } from "@/lib/match-analysis";

export function MatchAnalysis({ game }: { game: HistoryGame }) {
  const { t } = useT();

  const chartConfig = {
    whiteMoves: { label: t("played.white"),      color: "hsl(var(--state-white))" },
    blackMoves: { label: t("played.black"),      color: "hsl(var(--state-black))" },
    whiteCaps:  { label: t("rev.whiteCaptures"), color: "hsl(var(--state-white))" },
    blackCaps:  { label: t("rev.blackCaptures"), color: "hsl(var(--state-black))" },
  } satisfies ChartConfig;

  const data = useMemo(() => analyzeMatch(game, {
    pieces: { p: t("piece.pawn"), n: t("piece.knight"), b: t("piece.bishop"), r: t("piece.rook"), q: t("piece.queen"), k: t("piece.king") },
    moveTypes: { normal: t("movetype.normal"), capture: t("movetype.capture"), check: t("movetype.check"), castle: t("movetype.castle"), promotion: t("movetype.promotion") },
  }), [game, t]);

  return (
    <div className="space-y-3 p-4 sm:p-5">
      <h3 className="text-sm font-semibold">{t("rev.analysis")}</h3>

      {data.moves.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-36 items-center justify-center p-5 text-center text-sm text-muted-foreground">
            {t("rev.noMovesAnalysis")}
          </CardContent>
        </Card>
      ) : <>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t("rev.totalPlies")}</p><p className="text-lg font-semibold">{data.moves.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t("rev.whiteCaptures")}</p><p className="text-lg font-semibold text-state-white">{data.counters.whiteCaptures}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t("rev.blackCaptures")}</p><p className="text-lg font-semibold text-state-black">{data.counters.blackCaptures}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t("rev.whiteChecks")}</p><p className="text-lg font-semibold">{data.counters.whiteChecks}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t("rev.blackChecks")}</p><p className="text-lg font-semibold">{data.counters.blackChecks}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t("rev.castlesPromotions")}</p><p className="text-lg font-semibold">{data.counters.castles} / {data.counters.promotions}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle>{t("rev.pieceActivity")}</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.pieceActivity} barGap={6}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="piece" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Bar dataKey="whiteMoves" fill="var(--color-whiteMoves)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="blackMoves" fill="var(--color-blackMoves)" radius={[3, 3, 0, 0]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("rev.captureTimeline")}</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.timeline}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="ply" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Line type="monotone" dataKey="whiteCaps" stroke="var(--color-whiteCaps)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="blackCaps" stroke="var(--color-blackCaps)" strokeWidth={2} dot={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("rev.moveTypeDist")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-center">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.typeDistribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {data.typeDistribution.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {data.typeDistribution.map((item) => (
                <div key={item.name} className="rounded-sm border border-border bg-muted/40 p-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: item.color }} />
                    <span className="capitalize text-muted-foreground">{item.name}</span>
                  </div>
                  <div className="mt-1 font-mono text-sm font-semibold">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      </>}
    </div>
  );
}
