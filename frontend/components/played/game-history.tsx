"use client"

import { useState, useEffect, useCallback, useMemo } from "react";
import { HistoryGame } from "@/types/game.types";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { resolveTimeControlType } from "@/lib/time-control";
import { fetchJSONCached, invalidateFetchCache } from "@/lib/fetch-cache";
import { Skeleton } from "@/components/ui/skeleton";
import { BrainCircuit, Castle, SlidersHorizontal, Search, ArrowUpDown, Hash, LoaderCircle, RotateCcw, Trash, Trash2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { StatCards } from "./stat-cards";
import { resultVariant, formatDateTime, formatDuration, parsePgnHeader, resolveDurationSeconds } from "@/lib/game-utils";
import { useAuth } from "@/lib/auth-context";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { analyzeHistoryMoves } from "@/lib/post-game-analysis";

type LegacyHistoryGame = HistoryGame & {
  White?: string;
  Black?: string;
  whiteName?: string;
  blackName?: string;
  lastSeq?: number;
};

const isFinishedResult = (game: Pick<HistoryGame, "Result" | "historyStatus" | "outcomeStatus">) =>
  game.historyStatus === "finished" || game.outcomeStatus === "unconfirmed" ||
  game.Result === "1-0" || game.Result === "0-1" || game.Result === "1/2-1/2";

function timeControlBadgeClass(type: "blitz" | "rapid" | "classical") {
  if (type === "blitz") return "border-violet-300/50 bg-violet-500/10 text-violet-700 dark:text-violet-300";
  if (type === "rapid") return "border-sky-300/50 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  return "border-amber-300/50 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function normalizeHistoryId(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "$oid" in value) {
    const objectId = (value as { $oid?: unknown }).$oid;
    return typeof objectId === "string" ? objectId.trim() : "";
  }
  return "";
}

const INPUT_CLS =
  "h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground " +
  "outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring/50 transition-shadow " +
  "placeholder:text-muted-foreground/60 w-full";

export function GameHistory() {
  const [games, setGames]     = useState<HistoryGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [resultFilter, setResultFilter] = useState<"all" | "1-0" | "0-1" | "1/2-1/2">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "finished" | "unfinished">("all");
  const [search, setSearch] = useState("");
  const [boardFilter, setBoardFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [timeControlFilter, setTimeControlFilter] = useState<"all" | "blitz" | "rapid" | "classical">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "result" | "players" | "moves" | "duration">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [trash, setTrash] = useState<HistoryGame[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [pendingTrashGame, setPendingTrashGame] = useState<HistoryGame | null>(null);
  const [pendingPermanentDeleteGame, setPendingPermanentDeleteGame] = useState<HistoryGame | null>(null);
  const [pendingPermanentDeleteAll, setPendingPermanentDeleteAll] = useState(false);
  const [pendingResultGame, setPendingResultGame] = useState<HistoryGame | null>(null);
  const [resultValue, setResultValue] = useState<"1-0" | "0-1" | "1/2-1/2">("1-0");
  const [resultError, setResultError] = useState<string | null>(null);
  const [suggestingResult, setSuggestingResult] = useState(false);
  const [resultSuggestion, setResultSuggestion] = useState<{ result: "1-0" | "0-1" | null; cp: number | null; mate: number | null; depth: number } | null>(null);
  const [trashActionError, setTrashActionError] = useState<string | null>(null);
  const router = useRouter();
  const { t } = useT();
  const { isAdmin, token } = useAuth();

  const normalizeGame = useCallback((g: HistoryGame): HistoryGame => {
    const legacy = g as LegacyHistoryGame;
    const headers = parsePgnHeader(g.pgn ?? "");
    return {
      ...g,
      _id: normalizeHistoryId(g._id),
      // Older endgame records used White/Black while live snapshots use
      // WhiteName/BlackName. Keep both formats readable in the same table.
      WhiteName: g.WhiteName || legacy.whiteName || legacy.White || headers["White"] || "White",
      BlackName: g.BlackName || legacy.blackName || legacy.Black || headers["Black"] || "Black",
      Result: (g.Result || headers["Result"] || "*") as HistoryGame["Result"],
      Date: g.Date || headers["Date"] || g.createdAt || "",
      createdAt: g.createdAt || g.startedAt || g.createAt,
      totalMoves: g.fenHistory?.length ?? g.uciHistory?.length ?? legacy.lastSeq ?? 0,
    };
  }, []);

  const resultText = (game: HistoryGame) => {
    if (game.outcomeStatus === "unconfirmed") return t("played.unconfirmed");
    if (game.Result === "1-0") return t("result.whiteWin");
    if (game.Result === "0-1") return t("result.blackWin");
    if (game.Result === "1/2-1/2") return t("result.draw");
    return t("played.unfinished");
  };

  /** Opens the administrator result editor with the record's current result selected. */
  const openResultEditor = (game: HistoryGame) => {
    const currentResult = game.Result === "0-1" || game.Result === "1/2-1/2"
      ? game.Result
      : "1-0";
    setResultError(null);
    setResultSuggestion(null);
    setResultValue(currentResult);
    setPendingResultGame(game);
  };

  useEffect(() => {
    fetchJSONCached<HistoryGame[]>("/games/history", 10_000)
      .then((data: HistoryGame[]) => setGames(data.map(normalizeGame)))
      .catch((e: unknown) => console.warn("[history]", e instanceof Error ? e.message : e))
      .finally(() => setLoading(false));
  }, [normalizeGame]);

  useEffect(() => {
    if (isAdmin) return;
    setShowTrash(false);
    setTrash([]);
    setPendingTrashGame(null);
    setPendingPermanentDeleteGame(null);
    setPendingPermanentDeleteAll(false);
  }, [isAdmin]);

  const loadTrash = useCallback(async () => {
    if (!isAdmin || !token) throw new Error(t("played.sessionExpired"));
    const response = await fetch("/games/history/trash", { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(t("played.trashLoadError"));
    const data = await response.json() as HistoryGame[];
    setTrash(data.map(normalizeGame));
    setTrashError(null);
  }, [isAdmin, normalizeGame, t, token]);

  const toggleTrash = async () => {
    if (!isAdmin) return;
    const next = !showTrash;
    setShowTrash(next);
    setTrashError(null);
    if (next) {
      try { await loadTrash(); } catch (error) {
        setTrashError(error instanceof Error ? error.message : t("played.trashLoadError"));
      }
    }
  };

  const moveToTrash = async (id: string): Promise<boolean> => {
    if (!isAdmin || !token || busyId) return false;
    setBusyId(id);
    setTrashActionError(null);
    try {
      const response = await fetch(`/games/history/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        const retryAfter = response.headers.get("Retry-After");
        throw new Error(retryAfter ? t("played.rateLimitError", { seconds: retryAfter }) : body?.error ?? t("played.moveToTrashError"));
      }
      setGames((current) => current.filter((game) => game._id !== id));
      invalidateFetchCache("/games/history");
      if (showTrash) await loadTrash();
      return true;
    } catch (error) {
      setTrashActionError(error instanceof Error ? error.message : t("played.moveToTrashError"));
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
    if (!isAdmin || !token || busyId) return;
    setBusyId(id);
    try {
      const response = await fetch(`/games/history/${encodeURIComponent(id)}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(t("played.restoreError"));
      const restored = trash.find((game) => game._id === id);
      setTrash((current) => current.filter((game) => game._id !== id));
      if (restored) setGames((current) => [restored, ...current]);
      invalidateFetchCache("/games/history");
    } finally {
      setBusyId(null);
    }
  };

  const permanentlyDeleteFromTrash = async (id: string): Promise<boolean> => {
    if (!isAdmin || !token || busyId) return false;
    setBusyId(id);
    setTrashActionError(null);
    try {
      const response = await fetch(`/games/history/${encodeURIComponent(id)}/permanent`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        const retryAfter = response.headers.get("Retry-After");
        throw new Error(retryAfter ? t("played.rateLimitError", { seconds: retryAfter }) : body?.error ?? t("played.permanentDeleteError"));
      }
      setTrash((current) => current.filter((game) => game._id !== id));
      return true;
    } catch (error) {
      setTrashActionError(error instanceof Error ? error.message : t("played.permanentDeleteError"));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const confirmPermanentDelete = async () => {
    if (!pendingPermanentDeleteGame) return;
    if (await permanentlyDeleteFromTrash(pendingPermanentDeleteGame._id)) setPendingPermanentDeleteGame(null);
  };

  const permanentlyDeleteAllFromTrash = async (): Promise<boolean> => {
    if (!isAdmin || !token || busyId) return false;
    setBusyId("all-trash");
    setTrashActionError(null);
    try {
      const response = await fetch("/games/history/trash/permanent", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? t("played.emptyTrashError"));
      setTrash([]);
      return true;
    } catch (error) {
      setTrashActionError(error instanceof Error ? error.message : t("played.emptyTrashError"));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const confirmPermanentDeleteAll = async () => {
    if (await permanentlyDeleteAllFromTrash()) setPendingPermanentDeleteAll(false);
  };

  const updateGameResult = async () => {
    if (!pendingResultGame || !token || busyId) return;
    setBusyId(pendingResultGame._id);
    setResultError(null);
    try {
      const response = await fetch(`/games/history/${encodeURIComponent(pendingResultGame._id)}/result`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ result: resultValue }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? t("played.updateResultError"));
      }
      setGames((current) => current.map((game) => game._id === pendingResultGame._id
        ? { ...game, Result: resultValue, historyStatus: "finished", outcomeStatus: "confirmed" }
        : game));
      invalidateFetchCache("/games/history");
      setPendingResultGame(null);
    } catch (error) {
      setResultError(error instanceof Error ? error.message : t("played.updateResultError"));
    } finally {
      setBusyId(null);
    }
  };

  const suggestGameResult = async () => {
    if (!pendingResultGame || !token || suggestingResult) return;
    setSuggestingResult(true);
    setResultError(null);
    setResultSuggestion(null);
    try {
      const response = await fetch(`/games/history/${encodeURIComponent(pendingResultGame._id)}/result-suggestion`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => null) as { result?: "1-0" | "0-1" | null; cp?: number | null; mate?: number | null; depth?: number } | null;
      if (!response.ok) throw new Error(body?.result === undefined ? t("played.suggestResultError") : t("played.suggestResultUnavailable"));
      const suggestion = { result: body?.result ?? null, cp: body?.cp ?? null, mate: body?.mate ?? null, depth: body?.depth ?? 0 };
      setResultSuggestion(suggestion);
      if (suggestion.result) setResultValue(suggestion.result);
    } catch (error) {
      setResultError(error instanceof Error ? error.message : t("played.suggestResultError"));
    } finally {
      setSuggestingResult(false);
    }
  };

  const analyzeFromHistory = async (game: HistoryGame) => {
    if (!token || analysisId) return;
    setAnalysisId(game._id);
    setAnalysisError(null);
    try {
      const moves = await analyzeHistoryMoves(game, () => {});
      if (!moves.length) throw new Error(t("analysis.noMoves"));
      const response = await fetch(`/games/history/${encodeURIComponent(game._id)}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ moves, depth: 14 }),
      });
      if (response.status === 404) throw new Error(t("analysis.backendOutdated"));
      if (response.status === 401 || response.status === 403) throw new Error(t("analysis.authRequired"));
      if (response.status === 429) throw new Error(t("analysis.rateLimited"));
      if (response.status === 400) throw new Error(t("analysis.invalidData"));
      if (!response.ok) throw new Error(t("analysis.error"));
      const analysis = { engine: "Stockfish 18 Lite", depth: 14, updatedAt: new Date().toISOString(), moves };
      setGames((current) => current.map((item) => item._id === game._id ? { ...item, analysis } : item));
      invalidateFetchCache("/games/history");
    } catch {
      setAnalysisError(t("analysis.error"));
    } finally {
      setAnalysisId(null);
    }
  };

  const boardOptions = useMemo(() => Array.from(new Set(games.map((game) => game.boardID).filter((value): value is string => Boolean(value)))).sort(), [games]);
  const locationOptions = useMemo(() => Array.from(new Set(games.map((game) => game.location?.trim()).filter((value): value is string => Boolean(value)))).sort(), [games]);
  const hasAdvancedFilters = Boolean(boardFilter || locationFilter || dateFrom || dateTo || timeControlFilter !== "all" || statusFilter !== "all");

  const clearFilters = () => {
    setResultFilter("all"); setStatusFilter("all"); setSearch(""); setBoardFilter(""); setLocationFilter("");
    setTimeControlFilter("all"); setDateFrom(""); setDateTo("");
  };

  const filteredGames = games
    .filter((g) => (resultFilter === "all" ? true : g.Result === resultFilter))
    .filter((g) => statusFilter === "all" ? true : statusFilter === "unfinished" ? !isFinishedResult(g) : isFinishedResult(g))
    .filter((g) => !boardFilter || g.boardID === boardFilter)
    .filter((g) => !locationFilter || g.location?.trim() === locationFilter)
    .filter((g) => timeControlFilter === "all" || resolveTimeControlType(g.initialTimeMs, g.incrementMs, g.timeControlType) === timeControlFilter)
    .filter((g) => {
      const date = new Date(g.createdAt || g.startedAt || g.endedAt || g.Date);
      if (Number.isNaN(date.getTime())) return !dateFrom && !dateTo;
      if (dateFrom && date < new Date(`${dateFrom}T00:00:00`)) return false;
      if (dateTo && date > new Date(`${dateTo}T23:59:59.999`)) return false;
      return true;
    })
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
            {showTrash ? t("played.closeTrash") : t("played.openTrash")}
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
                    <h2 className="text-sm font-semibold">{t("played.trashTitle")}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("played.trashRetention")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {trash.length > 0 && <button type="button" disabled={Boolean(busyId)} onClick={() => { setTrashActionError(null); setPendingPermanentDeleteAll(true); }} className="text-xs text-destructive hover:underline disabled:opacity-50">{t("played.deleteAll")}</button>}
                    <span className="text-xs text-muted-foreground">{trash.length}</span>
                  </div>
                </div>
                {trashError ? (
                  <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">{trashError}</p>
                ) : trash.length === 0 ? (
                  <p className="py-3 text-center text-sm text-muted-foreground">{t("played.trashEmpty")}</p>
                ) : (
                  <div className="space-y-2">
                    {trash.map((game) => (
                      <div key={game._id} className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm"><span className="font-medium">{game.WhiteName}</span><span className="mx-1.5 text-muted-foreground">vs</span><span className="font-medium">{game.BlackName}</span></div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span>{t("played.dateLabel")} {formatDateTime(game.createdAt || game.endedAt || game.Date)}</span>
                            <span>{t("played.moveCountLabel")} {game.totalMoves}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button type="button" disabled={busyId === game._id} onClick={() => restoreFromTrash(game._id)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                            <RotateCcw className="size-3.5" />{t("played.restore")}
                          </button>
                          <button type="button" disabled={busyId === game._id} onClick={() => { setTrashActionError(null); setPendingPermanentDeleteGame(game); }} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" title={t("played.deletePermanently")}>
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

            {analysisError && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{analysisError}</p>}

            {/* Filter bar */}
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("played.filters")}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
                <label className="space-y-1 text-xs text-muted-foreground"><span>{t("played.player")}</span><div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("played.filterPlayers")} className={cn(INPUT_CLS, "pl-8")} />
                </div></label>
                <label className="space-y-1 text-xs text-muted-foreground"><span>{t("common.result")}</span><select
                  value={resultFilter}
                  onChange={(e) => setResultFilter(e.target.value as "all" | "1-0" | "0-1" | "1/2-1/2")}
                  className={cn(INPUT_CLS, "cursor-pointer")}
                >
                  <option value="all">{t("played.allResults")}</option>
                    <option value="1-0">{t("result.whiteWin")}</option>
                    <option value="0-1">{t("result.blackWin")}</option>
                    <option value="1/2-1/2">{t("result.draw")}</option>
                </select></label>
                <label className="space-y-1 text-xs text-muted-foreground"><span>{t("played.status")}</span><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "finished" | "unfinished")} className={cn(INPUT_CLS, "cursor-pointer")}>
                  <option value="all">{t("played.allStatuses")}</option>
                  <option value="finished">{t("played.finished")}</option>
                  <option value="unfinished">{t("played.unfinished")}</option>
                </select></label>
                <label className="space-y-1 text-xs text-muted-foreground"><span>{t("common.chessboard")}</span><select value={boardFilter} onChange={(e) => setBoardFilter(e.target.value)} className={cn(INPUT_CLS, "cursor-pointer")}>
                  <option value="">{t("played.allBoards")}</option>
                  {boardOptions.map((board) => <option key={board} value={board}>{board}</option>)}
                </select></label>
                <label className="space-y-1 text-xs text-muted-foreground"><span>{t("played.location")}</span><select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className={cn(INPUT_CLS, "cursor-pointer")}>
                  <option value="">{t("played.allLocations")}</option>
                  {locationOptions.map((location) => <option key={location} value={location}>{location}</option>)}
                </select></label>
                <label className="space-y-1 text-xs text-muted-foreground"><span>{t("played.dateFrom")}</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={INPUT_CLS} /></label>
                <label className="space-y-1 text-xs text-muted-foreground"><span>{t("played.dateTo")}</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={INPUT_CLS} /></label>
                <label className="space-y-1 text-xs text-muted-foreground"><span>{t("played.timeControl")}</span><select value={timeControlFilter} onChange={(e) => setTimeControlFilter(e.target.value as "all" | "blitz" | "rapid" | "classical")} className={cn(INPUT_CLS, "cursor-pointer")}>
                  <option value="all">{t("played.allTimeControls")}</option>
                  <option value="blitz">{t("timeControl.blitz")}</option>
                  <option value="rapid">{t("timeControl.rapid")}</option>
                  <option value="classical">{t("timeControl.classical")}</option>
                </select></label>
                <label className="space-y-1 text-xs text-muted-foreground"><span>{t("played.sortBy")}</span><select
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
                </select></label>
                {(search || resultFilter !== "all" || hasAdvancedFilters) && <div className="flex items-end"><button type="button" onClick={clearFilters} className="h-9 w-full rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{t("played.clearFilters")}</button></div>}
              </div>
            </div>

            {/* Table */}
            <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
              {/* Results count */}
              {search || resultFilter !== "all" || hasAdvancedFilters ? (
                <div className="px-4 py-2 border-b border-border bg-muted/40">
                  <p className="text-xs text-muted-foreground">
                    {t("played.showing", { n: filteredGames.length, total: games.length })}
                  </p>
                </div>
              ) : null}
              <div className="table-scroll max-h-[60vh] overflow-auto">
                <table className="w-full min-w-[920px] border-separate border-spacing-0">
                  <thead className="sticky top-0 z-20 bg-muted/50 backdrop-blur-sm">
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-[72px]">
                        #
                      </th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-[140px]">
                        <button type="button" onClick={() => toggleSort("result")} className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", sortBy === "result" && "text-foreground")}>
                        {t("common.result")} <ArrowUpDown className={cn("h-3 w-3", sortBy === "result" ? "opacity-100" : "opacity-40")} />
                        </button>
                      </th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider min-w-[240px]">
                        <button type="button" onClick={() => toggleSort("players")} className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", sortBy === "players" && "text-foreground")}>
                          {t("played.colPlayers")} <ArrowUpDown className={cn("h-3 w-3", sortBy === "players" ? "opacity-100" : "opacity-40")} />
                        </button>
                      </th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-[140px]">
                        {t("played.colTimeControl")}
                      </th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-[120px]">
                        <button type="button" onClick={() => toggleSort("moves")} className={cn("ml-auto inline-flex items-center gap-1 hover:text-foreground transition-colors", sortBy === "moves" && "text-foreground")}>
                        {t("common.moves")} <ArrowUpDown className={cn("h-3 w-3", sortBy === "moves" ? "opacity-100" : "opacity-40")} />
                        </button>
                      </th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-[140px]">
                        <button type="button" onClick={() => toggleSort("date")} className={cn("ml-auto inline-flex items-center gap-1 hover:text-foreground transition-colors", sortBy === "date" && "text-foreground")}>
                          {t("played.colDate")} <ArrowUpDown className={cn("h-3 w-3", sortBy === "date" ? "opacity-100" : "opacity-40")} />
                        </button>
                      </th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-[120px]">
                        <button type="button" onClick={() => toggleSort("duration")} className={cn("ml-auto inline-flex items-center gap-1 hover:text-foreground transition-colors", sortBy === "duration" && "text-foreground")}>
                        {t("common.duration")} <ArrowUpDown className={cn("h-3 w-3", sortBy === "duration" ? "opacity-100" : "opacity-40")} />
                        </button>
                      </th>
                      {(isAdmin || token) && <th className="w-[116px] px-4 py-2.5" aria-label={t("played.actions")} />}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGames.map((game, i) => {
                      const reviewId = typeof game._id === "string" ? game._id.trim() : "";
                      return <tr
                        key={reviewId || `history-${i}`}
                        onClick={() => { if (reviewId) router.push(`/played/review/${encodeURIComponent(reviewId)}`); }}
                        className={cn("group border-t border-border/60 transition-colors", reviewId ? "cursor-pointer hover:bg-accent/60" : "cursor-not-allowed opacity-60")}
                      >
                        <td className="px-4 py-3 text-xs text-muted-foreground/60 font-mono">
                          {i + 1}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={isFinishedResult(game) && game.outcomeStatus !== "unconfirmed" ? resultVariant(game.Result) : "secondary"}
                            className={cn("w-[118px] justify-center text-[11px]", (!isFinishedResult(game) || game.outcomeStatus === "unconfirmed") && "border border-primary/25 bg-primary/10 text-primary")}
                          >
                            {resultText(game)}
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
                        <td className="px-4 py-3">
                          {(() => {
                            const type = resolveTimeControlType(game.initialTimeMs, game.incrementMs, game.timeControlType);
                            return <Badge variant="outline" className={cn("w-[118px] justify-center text-[11px]", timeControlBadgeClass(type))}>
                              {t(`timeControl.${type}` as "timeControl.blitz" | "timeControl.rapid" | "timeControl.classical")}
                            </Badge>;
                          })()}
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
                        {(isAdmin || token) && (
                          <td className="px-4 py-3 text-right">
                            {token && <button type="button" disabled={Boolean(analysisId)} onClick={(event) => { event.stopPropagation(); void analyzeFromHistory(game); }} className="mr-1 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50" title={game.analysis?.moves.length ? t("analysis.reanalyze") : t("analysis.run")}>
                              {analysisId === game._id ? <LoaderCircle className="size-3.5 animate-spin" /> : <BrainCircuit className="size-3.5" />}
                            </button>}
                            {isAdmin && <button type="button" disabled={busyId === game._id} onClick={(event) => { event.stopPropagation(); setTrashActionError(null); setPendingTrashGame(game); }} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" title={t("played.moveToTrash")}>
                              <Trash2 className="size-3.5" />
                            </button>}
                            {isAdmin && <button type="button" disabled={busyId === game._id} onClick={(event) => { event.stopPropagation(); openResultEditor(game); }} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50" title={t("played.editResult")}>
                              <Pencil className="size-3.5" />
                            </button>}
                          </td>
                        )}
                      </tr>;
                    })}
                    {filteredGames.length === 0 && (
                      <tr>
                        <td colSpan={(isAdmin || token) ? 8 : 7} className="px-4 py-10 text-center text-sm text-muted-foreground">
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
            <DialogTitle>{t("played.moveToTrashTitle")}</DialogTitle>
            <DialogDescription>
              {t("played.moveToTrashGameDescription", { players: `${pendingTrashGame?.WhiteName ?? ""} vs ${pendingTrashGame?.BlackName ?? ""}` })}
            </DialogDescription>
          </DialogHeader>
          {trashActionError && <p className="mx-5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{trashActionError}</p>}
          <DialogFooter>
            <button type="button" disabled={Boolean(busyId)} onClick={() => setPendingTrashGame(null)} className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              {t("played.cancel")}
            </button>
            <button type="button" disabled={Boolean(busyId)} onClick={() => void confirmMoveToTrash()} className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
              {busyId ? t("played.moving") : t("played.moveToTrash")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(pendingPermanentDeleteGame)} onOpenChange={(open) => { if (!open && !busyId) setPendingPermanentDeleteGame(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("played.deletePermanentlyTitle")}</DialogTitle>
            <DialogDescription>
              {t("played.deletePermanentlyGameDescription", { players: `${pendingPermanentDeleteGame?.WhiteName ?? ""} vs ${pendingPermanentDeleteGame?.BlackName ?? ""}` })}
            </DialogDescription>
          </DialogHeader>
          {trashActionError && <p className="mx-5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{trashActionError}</p>}
          <DialogFooter>
            <button type="button" disabled={Boolean(busyId)} onClick={() => setPendingPermanentDeleteGame(null)} className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              {t("played.cancel")}
            </button>
            <button type="button" disabled={Boolean(busyId)} onClick={() => void confirmPermanentDelete()} className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
                            {busyId ? t("common.deleting") : t("played.deletePermanently")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={pendingPermanentDeleteAll} onOpenChange={(open) => { if (!open && !busyId) setPendingPermanentDeleteAll(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("played.emptyTrashTitle")}</DialogTitle>
            <DialogDescription>{t("played.emptyTrashDescription")}</DialogDescription>
          </DialogHeader>
          {trashActionError && <p className="mx-5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{trashActionError}</p>}
          <DialogFooter>
            <button type="button" disabled={Boolean(busyId)} onClick={() => setPendingPermanentDeleteAll(false)} className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">{t("played.cancel")}</button>
                        <button type="button" disabled={Boolean(busyId)} onClick={() => void confirmPermanentDeleteAll()} className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">{busyId ? t("common.deleting") : t("played.deleteAll")}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(pendingResultGame)} onOpenChange={(open) => { if (!open && !busyId) setPendingResultGame(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("played.editResultTitle")}</DialogTitle>
            <DialogDescription>
              {t("played.editResultDescription", { players: `${pendingResultGame?.WhiteName ?? ""} vs ${pendingResultGame?.BlackName ?? ""}` })}
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 py-2">
            <button type="button" disabled={suggestingResult || Boolean(busyId)} onClick={() => void suggestGameResult()} className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-primary/40 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50">
              {suggestingResult ? <LoaderCircle className="size-4 animate-spin" /> : <BrainCircuit className="size-4" />}
              {suggestingResult ? t("played.suggestingResult") : t("played.suggestResult")}
            </button>
            {resultSuggestion && <div className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <p>{t("played.suggestionLabel")} <span className="font-semibold text-foreground">{resultSuggestion.result === "1-0" ? t("result.whiteWin") : resultSuggestion.result === "0-1" ? t("result.blackWin") : t("played.suggestionUndetermined")}</span></p>
              <p className="mt-1">{t("played.suggestionScore", { score: resultSuggestion.mate !== null ? `M${Math.abs(resultSuggestion.mate)}` : resultSuggestion.cp !== null ? (resultSuggestion.cp / 100).toFixed(2) : "—", depth: resultSuggestion.depth })}</p>
            </div>}
            <label className="space-y-1 text-sm text-muted-foreground">
                                <span>{t("common.result")}</span>
              <select value={resultValue} onChange={(event) => setResultValue(event.target.value as typeof resultValue)} className={INPUT_CLS}>
                <option value="1-0">{t("result.whiteWin")}</option>
                <option value="0-1">{t("result.blackWin")}</option>
                <option value="1/2-1/2">{t("result.draw")}</option>
              </select>
            </label>
          </div>
          {resultError && <p className="mx-5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{resultError}</p>}
          <DialogFooter>
            <button type="button" disabled={Boolean(busyId)} onClick={() => setPendingResultGame(null)} className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">{t("played.cancel")}</button>
                            <button type="button" disabled={Boolean(busyId)} onClick={() => void updateGameResult()} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{busyId ? t("common.saving") : t("played.saveResult")}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
