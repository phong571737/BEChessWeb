"use client"

import { useState, useEffect, useCallback } from "react";
import { HistoryGame } from "@/types/game.types";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { fetchJSONCached, invalidateFetchCache } from "@/lib/fetch-cache";
import { Skeleton } from "@/components/ui/skeleton";
import { Castle, SlidersHorizontal, Search, ArrowUpDown, Hash, RotateCcw, Trash, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { StatCards } from "./stat-cards";
import { resultVariant, formatDateTime, formatDuration, parsePgnHeader, resolveDurationSeconds } from "@/lib/game-utils";
import { useAuth } from "@/lib/auth-context";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const [trash, setTrash] = useState<HistoryGame[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingTrashGame, setPendingTrashGame] = useState<HistoryGame | null>(null);
  const [pendingPermanentDeleteGame, setPendingPermanentDeleteGame] = useState<HistoryGame | null>(null);
  const [trashActionError, setTrashActionError] = useState<string | null>(null);
  const router = useRouter();
  const { t, locale } = useT();
  const { isAdmin, token } = useAuth();

  const normalizeGame = useCallback((g: HistoryGame): HistoryGame => {
    const headers = parsePgnHeader(g.pgn ?? "");
    return {
      ...g,
      WhiteName: g.WhiteName || headers["White"] || "?",
      BlackName: g.BlackName || headers["Black"] || "?",
      Result: (g.Result || headers["Result"] || "*") as HistoryGame["Result"],
      Date: g.Date || headers["Date"] || g.createdAt || "",
      createdAt: g.createdAt || g.startedAt || g.createAt,
    };
  }, []);

  useEffect(() => {
    fetchJSONCached<HistoryGame[]>("/games/history", 10_000)
      .then((data: HistoryGame[]) => setGames(data.map(normalizeGame)))
      .catch((e: unknown) => console.warn("[history]", e instanceof Error ? e.message : e))
      .finally(() => setLoading(false));
  }, [normalizeGame]);

  const loadTrash = useCallback(async () => {
    if (!token) throw new Error(locale === "vi" ? "Phiên đăng nhập đã hết hạn." : "Your login session has expired.");
    const response = await fetch("/games/history/trash", { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(locale === "vi" ? "Không thể tải thùng rác. Hãy kiểm tra backend đã được cập nhật." : "Unable to load the recycle bin. Check that the backend is updated.");
    const data = await response.json() as HistoryGame[];
    setTrash(data.map(normalizeGame));
    setTrashError(null);
  }, [locale, normalizeGame, token]);

  const toggleTrash = async () => {
    const next = !showTrash;
    setShowTrash(next);
    setTrashError(null);
    if (next) {
      try { await loadTrash(); } catch (error) {
        setTrashError(error instanceof Error ? error.message : "Unable to load the recycle bin.");
      }
    }
  };

  const moveToTrash = async (id: string): Promise<boolean> => {
    if (!token || busyId) return false;
    setBusyId(id);
    setTrashActionError(null);
    try {
      const response = await fetch(`/games/history/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Unable to move history to trash");
      setGames((current) => current.filter((game) => game._id !== id));
      invalidateFetchCache("/games/history");
      if (showTrash) await loadTrash();
      return true;
    } catch (error) {
      setTrashActionError(error instanceof Error ? error.message : "Unable to move history to trash");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const confirmMoveToTrash = async () => {
    if (!pendingTrashGame) return;
    if (await moveToTrash(pendingTrashGame._id)) setPendingTrashGame(null);
  };

  const restoreFromTrash = async (id: string) => {
    if (!token || busyId) return;
    setBusyId(id);
    try {
      const response = await fetch(`/games/history/${encodeURIComponent(id)}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Unable to restore history");
      const restored = trash.find((game) => game._id === id);
      setTrash((current) => current.filter((game) => game._id !== id));
      if (restored) setGames((current) => [restored, ...current]);
      invalidateFetchCache("/games/history");
    } finally {
      setBusyId(null);
    }
  };

  const permanentlyDeleteFromTrash = async (id: string): Promise<boolean> => {
    if (!token || busyId) return false;
    setBusyId(id);
    setTrashActionError(null);
    try {
      const response = await fetch(`/games/history/${encodeURIComponent(id)}/permanent`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Unable to permanently delete history");
      setTrash((current) => current.filter((game) => game._id !== id));
      return true;
    } catch (error) {
      setTrashActionError(error instanceof Error ? error.message : "Unable to permanently delete history");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const confirmPermanentDelete = async () => {
    if (!pendingPermanentDeleteGame) return;
    if (await permanentlyDeleteFromTrash(pendingPermanentDeleteGame._id)) setPendingPermanentDeleteGame(null);
  };

  const filteredGames = games
    .filter((g) => (resultFilter === "all" ? true : g.Result === resultFilter))
    .filter((g) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return `${g.WhiteName} ${g.BlackName}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") {
        cmp = new Date(a.Date).getTime() - new Date(b.Date).getTime();
      } else if (sortBy === "moves") {
        cmp = a.totalMoves - b.totalMoves;
      } else if (sortBy === "players") {
        const ap = `${a.WhiteName} vs ${a.BlackName}`.toLowerCase();
        const bp = `${b.WhiteName} vs ${b.BlackName}`.toLowerCase();
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
        {isAdmin && (
          <button type="button" onClick={toggleTrash} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Trash2 className="size-3.5" />
            {showTrash ? (locale === "vi" ? "Đóng thùng rác" : "Close trash") : (locale === "vi" ? "Thùng rác" : "Trash")}
          </button>
        )}
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
        ) : games.length === 0 && !(isAdmin && showTrash) ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
            <Castle className="h-12 w-12 opacity-20" />
            <p className="text-sm">{t("played.noGames")}</p>
          </div>
        ) : (
          <>
            {isAdmin && showTrash && (
              <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">{locale === "vi" ? "Thùng rác lịch sử" : "History trash"}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{locale === "vi" ? "Bản ghi sẽ bị xóa vĩnh viễn sau 30 ngày." : "Records are permanently deleted after 30 days."}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{trash.length}</span>
                </div>
                {trashError ? (
                  <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">{trashError}</p>
                ) : trash.length === 0 ? (
                  <p className="py-3 text-center text-sm text-muted-foreground">{locale === "vi" ? "Thùng rác trống" : "Trash is empty"}</p>
                ) : (
                  <div className="space-y-2">
                    {trash.map((game) => (
                      <div key={game._id} className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm"><span className="font-medium">{game.WhiteName}</span><span className="mx-1.5 text-muted-foreground">vs</span><span className="font-medium">{game.BlackName}</span></div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span>{locale === "vi" ? "Ngày:" : "Date:"} {formatDateTime(game.createdAt || game.endedAt || game.Date)}</span>
                            <span>{locale === "vi" ? "Số nước đi:" : "Moves:"} {game.totalMoves}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button type="button" disabled={busyId === game._id} onClick={() => restoreFromTrash(game._id)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                            <RotateCcw className="size-3.5" />{locale === "vi" ? "Khôi phục" : "Restore"}
                          </button>
                          <button type="button" disabled={busyId === game._id} onClick={() => { setTrashActionError(null); setPendingPermanentDeleteGame(game); }} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" title={locale === "vi" ? "Xóa vĩnh viễn" : "Delete permanently"}>
                            <Trash className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
                      {isAdmin && <th className="w-[76px] px-4 py-2.5" aria-label={locale === "vi" ? "Thao tác" : "Actions"} />}
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
                            <span className="text-sm font-medium text-foreground truncate">{game.WhiteName}</span>
                            <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider shrink-0">vs</span>
                            <span className="text-sm font-medium text-foreground truncate">{game.BlackName}</span>
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
                          {formatDateTime(game.createdAt || game.endedAt || game.Date)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground font-mono">
                          {formatDuration(resolveDurationSeconds(game.durationSec, game.startedAt || game.createdAt || game.createAt, game.endedAt || game.lastMoveAt || game.updatedAt))}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-right">
                            <button type="button" disabled={busyId === game._id} onClick={(event) => { event.stopPropagation(); setTrashActionError(null); setPendingTrashGame(game); }} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" title={locale === "vi" ? "Đưa vào thùng rác" : "Move to trash"}>
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {filteredGames.length === 0 && (
                      <tr>
                        <td colSpan={isAdmin ? 7 : 6} className="px-4 py-10 text-center text-sm text-muted-foreground">
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
      <Dialog open={Boolean(pendingTrashGame)} onOpenChange={(open) => { if (!open && !busyId) setPendingTrashGame(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{locale === "vi" ? "Chuyển ván cờ vào thùng rác?" : "Move this game to trash?"}</DialogTitle>
            <DialogDescription>
              {locale === "vi"
                ? `Ván ${pendingTrashGame?.WhiteName ?? ""} vs ${pendingTrashGame?.BlackName ?? ""} sẽ bị ẩn khỏi lịch sử. Bạn có thể khôi phục ván này trong vòng 30 ngày.`
                : `The game ${pendingTrashGame?.WhiteName ?? ""} vs ${pendingTrashGame?.BlackName ?? ""} will be hidden from history. You can restore it within 30 days.`}
            </DialogDescription>
          </DialogHeader>
          {trashActionError && <p className="mx-5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{trashActionError}</p>}
          <DialogFooter>
            <button type="button" disabled={Boolean(busyId)} onClick={() => setPendingTrashGame(null)} className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              {locale === "vi" ? "Hủy" : "Cancel"}
            </button>
            <button type="button" disabled={Boolean(busyId)} onClick={() => void confirmMoveToTrash()} className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
              {busyId ? (locale === "vi" ? "Đang chuyển..." : "Moving...") : (locale === "vi" ? "Chuyển vào thùng rác" : "Move to trash")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(pendingPermanentDeleteGame)} onOpenChange={(open) => { if (!open && !busyId) setPendingPermanentDeleteGame(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{locale === "vi" ? "Xóa vĩnh viễn ván cờ này?" : "Delete this game permanently?"}</DialogTitle>
            <DialogDescription>
              {locale === "vi"
                ? `Ván ${pendingPermanentDeleteGame?.WhiteName ?? ""} vs ${pendingPermanentDeleteGame?.BlackName ?? ""} sẽ bị xóa hoàn toàn và không thể khôi phục.`
                : `The game ${pendingPermanentDeleteGame?.WhiteName ?? ""} vs ${pendingPermanentDeleteGame?.BlackName ?? ""} will be deleted permanently and cannot be restored.`}
            </DialogDescription>
          </DialogHeader>
          {trashActionError && <p className="mx-5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{trashActionError}</p>}
          <DialogFooter>
            <button type="button" disabled={Boolean(busyId)} onClick={() => setPendingPermanentDeleteGame(null)} className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              {locale === "vi" ? "Hủy" : "Cancel"}
            </button>
            <button type="button" disabled={Boolean(busyId)} onClick={() => void confirmPermanentDelete()} className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
              {busyId ? (locale === "vi" ? "Đang xóa..." : "Deleting...") : (locale === "vi" ? "Xóa vĩnh viễn" : "Delete permanently")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
