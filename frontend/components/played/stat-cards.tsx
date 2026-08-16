"use client"

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { HistoryGame } from "@/types/game.types";
import { Crown } from "lucide-react";
import {ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Minus } from "lucide-react";
import { ResponsiveContainer, Bar, BarChart, PieChart, Pie, Cell, XAxis, YAxis } from "recharts";

interface Props {
  games: HistoryGame[];
}

export function StatCards({ games }: Props) {
  const { t } = useT();
  const [hoveredKey, setHoveredKey] = useState<"white" | "draw" | "black" | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const white = games.filter((g) => g.Result === "1-0").length;
  const black = games.filter((g) => g.Result === "0-1").length;
  const draw  = games.filter((g) => g.Result === "1/2-1/2").length;
  const total = games.length;

  const chartData = [{ name: "Results", white, draw, black, total }];
  const pieData = [
    { name: "white", value: white },
    { name: "draw", value: draw },
    { name: "black", value: black },
  ].filter((x) => x.value > 0);

  const chartConfig = {
    white: { label: t("played.white"), color: "hsl(var(--state-white))", icon: Crown },
    draw:  { label: t("result.draw"),  color: "hsl(var(--state-draw))",  icon: Minus },
    black: { label: t("played.black"), color: "hsl(var(--state-black))", icon: Crown },
  } satisfies ChartConfig;

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 640px)");
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
    onChange(mql);
    const listener = (e: MediaQueryListEvent) => onChange(e);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, []);

  return (
    <div className="space-y-3 mb-6">
      {/* Stat grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-sm border border-border bg-card p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="h-3.5 w-3.5 text-state-white" />
            <span className="text-xs text-muted-foreground font-medium">{t("played.white")}</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-state-white">{white}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("played.gamesWon")}</p>
        </div>

        <div className="rounded-sm border border-border bg-card p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="h-3.5 w-3.5 text-state-black" />
            <span className="text-xs text-muted-foreground font-medium">{t("played.black")}</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-state-black">{black}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("played.gamesWon")}</p>
        </div>

        <div className="rounded-sm border border-border bg-card p-3 sm:p-4 sm:col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">{t("played.draws")}</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-muted-foreground">{draw}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("played.gamesDrawn")}</p>
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="rounded-sm border border-border bg-card p-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-3">
            <span className="font-medium text-foreground">{t("played.performance")}</span>
            <span>{total} games</span>
          </div>
          <ChartContainer config={chartConfig} className={isMobile ? "h-[160px] w-full" : "h-[84px] w-full"}>
            <ResponsiveContainer width="100%" height="100%">
              {isMobile ? (
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={32} outerRadius={56} paddingAngle={2}>
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={`var(--color-${entry.name})`} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        hideLabel
                        className="w-[170px]"
                        formatter={(value, name, item, index) => (
                          <>
                            <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: `var(--color-${String(name)})` }} />
                            {chartConfig[String(name) as keyof typeof chartConfig]?.label ?? String(name)}
                            <div className="ml-auto font-mono font-medium text-foreground tabular-nums">{value}</div>
                            {index === pieData.length - 1 && (
                              <div className="mt-1.5 flex basis-full items-center border-t border-border pt-1.5 text-xs font-medium text-foreground">
                                {t("played.total")}
                                <div className="ml-auto font-mono font-medium tabular-nums">{total}</div>
                              </div>
                            )}
                          </>
                        )}
                      />
                    }
                  />
                </PieChart>
              ) : (
                <BarChart data={chartData} accessibilityLayer layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <XAxis type="number" hide domain={[0, "dataMax"]} />
                  <YAxis type="category" dataKey="name" hide />
                  <Bar dataKey="white" stackId="a" fill="var(--color-white)" radius={[4, 0, 0, 4]} barSize={18} fillOpacity={hoveredKey && hoveredKey !== "white" ? 0.35 : 0.95} stroke={hoveredKey === "white" ? "hsl(var(--foreground))" : "transparent"} strokeWidth={hoveredKey === "white" ? 1.5 : 0} onMouseEnter={() => setHoveredKey("white")} onMouseLeave={() => setHoveredKey(null)} />
                  <Bar dataKey="draw" stackId="a" fill="var(--color-draw)" barSize={18} fillOpacity={hoveredKey && hoveredKey !== "draw" ? 0.35 : 0.95} stroke={hoveredKey === "draw" ? "hsl(var(--foreground))" : "transparent"} strokeWidth={hoveredKey === "draw" ? 1.5 : 0} onMouseEnter={() => setHoveredKey("draw")} onMouseLeave={() => setHoveredKey(null)} />
                  <Bar dataKey="black" stackId="a" fill="var(--color-black)" radius={[0, 4, 4, 0]} barSize={18} fillOpacity={hoveredKey && hoveredKey !== "black" ? 0.35 : 0.95} stroke={hoveredKey === "black" ? "hsl(var(--foreground))" : "transparent"} strokeWidth={hoveredKey === "black" ? 1.5 : 0} onMouseEnter={() => setHoveredKey("black")} onMouseLeave={() => setHoveredKey(null)} />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        hideLabel
                        className="w-[190px]"
                        formatter={(value, name, item, index) => (
                          <>
                            <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: `var(--color-${String(name)})` }} />
                            {chartConfig[String(name) as keyof typeof chartConfig]?.label ?? String(name)}
                            <div className="ml-auto font-mono font-medium text-foreground tabular-nums">{value}</div>
                            {index === 2 && (
                              <div className="mt-1.5 flex basis-full items-center border-t border-border pt-1.5 text-xs font-medium text-foreground">
                                {t("played.total")}
                                <div className="ml-auto font-mono font-medium tabular-nums">{item.payload.total}</div>
                              </div>
                            )}
                          </>
                        )}
                      />
                    }
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </ChartContainer>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-state-white" />{t("played.white")}
            </span>
            <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-state-draw" />{t("result.draw")}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-state-black" />{t("played.black")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
