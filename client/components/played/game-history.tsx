"use client";

import { useEffect, useState } from "react";
import { ArrowUpDown, Castle, Hash, Search, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { StatCards } from "./stat-cards";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { HistoryGame } from "@/types/game.types";
import { fetchJSONCached } from "@/lib/fetch-cache";
import { resultVariant, formatDateTime, formatDuration } from "@/lib/game-utils";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const INPUT_CLS =
  "h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground " +
  "outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring/50 transition-shadow " +
  "placeholder:text-muted-foreground/60 w-full";

export function GameHistory() {
  const [games, setGames]     = useState<HistoryGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [resultFilter, setResultFilter] = useState<"all" | "1-0" | "0-1" | "1/2-1/2">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "result" | "players" | "moves" | "duration">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const router = useRouter();
  const { t } = useT();

  useEffect(() => {
    fetchJSONCached<HistoryGame[]>("/games/history", 10_000)
      .then((data: HistoryGame[]) => setGames(data))
      .catch((e: unknown) => console.warn("[history]", e instanceof Error ? e.message : e))
      .finally(() => setLoading(false));
  }, []);

  const filteredGames = games
    .filter((g) => (resultFilter === "all" ? true : g.Result === resultFilter))
    .filter((g) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return `${g.White} ${g.Black}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") {
        cmp = new Date(a.Date).getTime() - new Date(b.Date).getTime();
      } else if (sortBy === "moves") {
        cmp = a.totalMoves - b.totalMoves;
      } else if (sortBy === "players") {
        const ap = `${a.White} vs ${a.Black}`.toLowerCase();
        const bp = `${b.White} vs ${b.Black}`.toLowerCase();
        cmp = ap.localeCompare(bp);
      } else if (sortBy === "duration") {
        cmp = (a.durationSec ?? -1) - (b.durationSec ?? -1);
      } else if (sortBy === "result") {
        const rank = (r: string) => (r === "1-0" ? 0 : r === "0-1" ? 1 : r === "1/2-1/2" ? 2 : 3);
        cmp = rank(a.Result) - rank(b.Result);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  const toggleSort = (field: "date" | "result" | "players" | "moves" | "duration") => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(field);
    setSortDir(field === "date" ? "desc" : "asc");
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Page header — same pattern as Home & Device */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border bg-background/60">
        <div>
          <h1 className="text-sm font-semibold">{t("played.title")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("played.gamesPlayed", { n: games.length })}
          </p>
        </div>
      </div>

      <div className="px-4 sm:px-5 py-4 sm:py-5 space-y-4">
        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
            <Skeleton className="h-[108px] w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="space-y-px p-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-md" />
                ))}
              </div>
            </div>
          </div>
        ) : games.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
            <Castle className="h-12 w-12 opacity-20" />
            <p className="text-sm">{t("played.noGames")}</p>
          </div>
        ) : (
          <>
            <StatCards games={games} />

            {/* Filter bar */}
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("played.filters")}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("played.filterPlayers")}
                    className={cn(INPUT_CLS, "pl-8")}
                  />
                </div>
                {/* Result filter */}
                <select
                  value={resultFilter}
                  onChange={(e) => setResultFilter(e.target.value as "all" | "1-0" | "0-1" | "1/2-1/2")}
                  className={cn(INPUT_CLS, "cursor-pointer")}
                >
                  <option value="all">{t("played.allResults")}</option>
                  <option value="1-0">{t("played.whiteWin")}</option>
                  <option value="0-1">{t("played.blackWin")}</option>
                  <option value="1/2-1/2">{t("played.draw")}</option>
                </select>
                {/* Sort */}
                <select
                  value={`${sortBy}:${sortDir}`}
                  onChange={(e) => {
                    const [field, dir] = e.target.value.split(":") as [
                      "date" | "result" | "players" | "moves" | "duration",
                      "asc" | "desc"
                    ];
                    setSortBy(field);
                    setSortDir(dir);
                  }}
                  className={cn(INPUT_CLS, "cursor-pointer")}
                >
                  <option value="date:desc">{t("played.dateNewest")}</option>
                  <option value="date:asc">{t("played.dateOldest")}</option>
                  <option value="moves:desc">{t("played.movesHL")}</option>
                  <option value="moves:asc">{t("played.movesLH")}</option>
                  <option value="duration:desc">{t("played.durLS")}</option>
                  <option value="duration:asc">{t("played.durSL")}</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
              {/* Results count */}
              {search || resultFilter !== "all" ? (
                <div className="px-4 py-2 border-b border-border bg-muted/40">
                  <p className="text-xs text-muted-foreground">
                    {t("played.showing", { n: filteredGames.length, total: games.length })}
                  </p>
                </div>
              ) : null}
              <div className="table-scroll max-h-[60vh] overflow-auto">
                <table className="w-full min-w-[1120px] border-separate border-spacing-0">
                  <thead className="sticky top-0 z-20 bg-muted/50 backdrop-blur-sm">
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-[72px]">
                        #
                      </th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-[140px]">
                        <button type="button" onClick={() => toggleSort("result")} className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", sortBy === "result" && "text-foreground")}>
                          {t("played.colResult")} <ArrowUpDown className={cn("h-3 w-3", sortBy === "result" ? "opacity-100" : "opacity-40")} />
                        </button>
                      </th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider min-w-[240px]">
                        <button type="button" onClick={() => toggleSort("players")} className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", sortBy === "players" && "text-foreground")}>
                          {t("played.colPlayers")} <ArrowUpDown className={cn("h-3 w-3", sortBy === "players" ? "opacity-100" : "opacity-40")} />
                        </button>
                      </th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-[120px]">
                        <button type="button" onClick={() => toggleSort("moves")} className={cn("ml-auto inline-flex items-center gap-1 hover:text-foreground transition-colors", sortBy === "moves" && "text-foreground")}>
                          {t("played.colMoves")} <ArrowUpDown className={cn("h-3 w-3", sortBy === "moves" ? "opacity-100" : "opacity-40")} />
                        </button>
                      </th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-[140px]">
                        <button type="button" onClick={() => toggleSort("date")} className={cn("ml-auto inline-flex items-center gap-1 hover:text-foreground transition-colors", sortBy === "date" && "text-foreground")}>
                          {t("played.colDate")} <ArrowUpDown className={cn("h-3 w-3", sortBy === "date" ? "opacity-100" : "opacity-40")} />
                        </button>
                      </th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-[120px]">
                        <button type="button" onClick={() => toggleSort("duration")} className={cn("ml-auto inline-flex items-center gap-1 hover:text-foreground transition-colors", sortBy === "duration" && "text-foreground")}>
                          {t("played.colDuration")} <ArrowUpDown className={cn("h-3 w-3", sortBy === "duration" ? "opacity-100" : "opacity-40")} />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGames.map((game, i) => (
                      <tr
                        key={game._id}
                        onClick={() => router.push(`/played/review/${game._id}`)}
                        className="group cursor-pointer border-t border-border/60 hover:bg-accent/60 transition-colors"
                      >
                        <td className="px-4 py-3 text-xs text-muted-foreground/60 font-mono">
                          {i + 1}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={resultVariant(game.Result)} className="w-[88px] justify-center text-[11px]">
                            {game.Result === "1-0" ? t("result.whiteWin") : game.Result === "0-1" ? t("result.blackWin") : game.Result === "1/2-1/2" ? t("result.draw") : game.Result}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="size-2.5 rounded-full bg-[#f0f0f0] border border-black/10 dark:border-white/10 shrink-0" />
                            <span className="text-sm font-medium text-foreground truncate">{game.White}</span>
                            <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider shrink-0">vs</span>
                            <span className="text-sm font-medium text-foreground truncate">{game.Black}</span>
                            <span className="size-2.5 rounded-full bg-[#1a1a1a] border border-white/10 shrink-0" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Hash className="h-3 w-3 opacity-60" />
                            {game.totalMoves}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                          {formatDateTime(game.createAt || game.endedAt || game.Date)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground font-mono">
                          {formatDuration(game.durationSec)}
                        </td>
                      </tr>
                    ))}
                    {filteredGames.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          {t("played.noMatch")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
