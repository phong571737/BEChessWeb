"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Clock3, MonitorCog, Radio, Trophy, Users } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { apiFetch } from "@/lib/api-fetch";
import { formatDuration, resolveDurationSeconds } from "@/lib/game-utils";
import type { ActiveGame, HistoryGame, PhysicalBoard } from "@/types/game.types";

type RangeDays = 7 | 30;

interface BoardUptimeSummary {
    boardID: string;
    online: boolean;
    onlineSince?: string | null;
    lastOnlineAt?: string | null;
    lastOfflineAt?: string | null;
    totalOnlineSec: number;
    sessionCount: number;
    batteryVoltage?: number | null;
    batteryPercent?: number | null;
    batteryState?: "normal" | "low" | "critical" | null;
    batteryUpdatedAt?: string | null;
}

interface BoardOnlineSession {
    boardID: string;
    onlineAt: string;
    offlineAt: string | null;
    durationSec: number;
    online: boolean;
}

function validDate(value?: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function historyDate(game: HistoryGame): Date | null {
    for (const raw of [game.startedAt, game.createdAt, game.endedAt, game.Date]) {
        if (!raw) continue;

        // Mongo dates are serialized as ISO strings containing a millisecond
        // separator (for example, `...00.123Z`). Replacing every dot before
        // parsing corrupts that otherwise valid value. Parse it unchanged
        // first, then support the legacy PGN `YYYY.MM.DD` representation.
        const direct = new Date(raw);
        if (!Number.isNaN(direct.getTime())) return direct;

        const legacyPgnDate = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(raw);
        if (legacyPgnDate) {
            const [, year, month, day] = legacyPgnDate;
            const normalized = new Date(`${year}-${month}-${day}T00:00:00`);
            if (!Number.isNaN(normalized.getTime())) return normalized;
        }
    }
    return null;
}

function durationOf(game: HistoryGame): number {
    return resolveDurationSeconds(game.durationSec, game.startedAt || game.createdAt || game.createAt, game.endedAt || game.lastMoveAt || game.updatedAt) ?? 0;
}

function isFinished(game: HistoryGame): boolean {
    return game.historyStatus === "finished" || ["1-0", "0-1", "1/2-1/2"].includes(game.Result);
}

function liveDurationOf(game: ActiveGame): number {
    return resolveDurationSeconds(game.durationSec, game.startedAt, game.lastMoveAt) ?? 0;
}

export default function DashboardPage() {
    const { isAdmin } = useAuth();
    const { t, locale } = useT();
    const [range, setRange] = useState<RangeDays>(7);
    const [history, setHistory] = useState<HistoryGame[]>([]);
    const [liveGames, setLiveGames] = useState<ActiveGame[]>([]);
    const [boards, setBoards] = useState<PhysicalBoard[]>([]);
    const [boardUptime, setBoardUptime] = useState<BoardUptimeSummary[]>([]);
    const [onlineSessions, setOnlineSessions] = useState<BoardOnlineSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!isAdmin) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        Promise.all([
            fetch("/games/history").then((response) => response.ok ? response.json() as Promise<HistoryGame[]> : Promise.reject(new Error("history"))),
            fetch("/boards").then((response) => response.ok ? response.json() as Promise<Array<{ boardID: string; gameID?: string | null; status?: string | null }>> : []),
            apiFetch("/games/current").then((response) => response.ok ? response.json() as Promise<ActiveGame[] | null> : Promise.reject(new Error("current games"))),
            apiFetch("/boards/uptime").then((response) => response.ok ? response.json() as Promise<BoardUptimeSummary[]> : Promise.reject(new Error("board uptime"))),
        ])
            .then(([games, liveBoards, currentGames, uptime]) => {
                if (cancelled) return;
                setHistory(Array.isArray(games) ? games : []);
                setLiveGames(Array.isArray(currentGames) ? currentGames : []);
                setBoardUptime(Array.isArray(uptime) ? uptime : []);
                setBoards(liveBoards.map((board) => ({
                    boardID: board.boardID,
                    gameID: board.gameID ?? null,
                    gameStatus: board.status === "ok" ? "active" : null,
                    online: true,
                })));
            })
            .catch(() => { if (!cancelled) setError(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [isAdmin]);

    useEffect(() => {
        if (!isAdmin) return;
        let cancelled = false;
        const loadConnectivity = async () => {
            try {
                const [uptimeResponse, sessionsResponse] = await Promise.all([
                    apiFetch("/boards/uptime"),
                    apiFetch(`/boards/uptime/sessions?days=${range}`),
                ]);
                if (!uptimeResponse.ok || !sessionsResponse.ok) throw new Error("board connectivity");
                const [uptime, sessions] = await Promise.all([
                    uptimeResponse.json() as Promise<BoardUptimeSummary[]>,
                    sessionsResponse.json() as Promise<BoardOnlineSession[]>,
                ]);
                if (!cancelled) {
                    setBoardUptime(Array.isArray(uptime) ? uptime : []);
                    setOnlineSessions(Array.isArray(sessions) ? sessions : []);
                }
            } catch {
                if (!cancelled) setError(true);
            }
        };
        void loadConnectivity();
        const refreshTimer = window.setInterval(() => void loadConnectivity(), 30_000);
        return () => {
            cancelled = true;
            window.clearInterval(refreshTimer);
        };
    }, [isAdmin, range]);

    const data = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const since = new Date(today);
        since.setDate(since.getDate() - (range - 1));
        const games = history.filter((game) => {
            const date = historyDate(game);
            return date !== null && date >= since;
        });
        const playingGames = liveGames.filter((game) => game.status === "playing");
        const historyGameIds = new Set(games.map((game) => game.gameID).filter((id): id is string => Boolean(id)));
        const liveGamesWithoutHistory = playingGames.filter((game) => !historyGameIds.has(game.gameID));
        const duration = games.reduce((total, game) => total + durationOf(game), 0)
            + liveGamesWithoutHistory.reduce((total, game) => total + liveDurationOf(game), 0);
        const completedGames = games.filter(isFinished);
        const results = {
            white: games.filter((game) => game.Result === "1-0").length,
            black: games.filter((game) => game.Result === "0-1").length,
            draw: games.filter((game) => game.Result === "1/2-1/2").length,
            active: playingGames.length,
        };
        const maxResult = Math.max(1, ...Object.values(results));
        const daily = Array.from({ length: range }, (_, index) => {
            const day = new Date(since);
            day.setDate(since.getDate() + index);
            const count = games.filter((game) => {
                const date = historyDate(game);
                return date?.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
            }).length;
            return { day, count };
        });
        const maxDaily = Math.max(1, ...daily.map((item) => item.count));
        const onlineDaily = daily.map(({ day }) => {
            const dayEnd = new Date(day);
            dayEnd.setDate(dayEnd.getDate() + 1);
            const seconds = onlineSessions.reduce((total, session) => {
                const onlineAt = validDate(session.onlineAt);
                const offlineAt = validDate(session.offlineAt) ?? now;
                if (!onlineAt) return total;
                const overlapMs = Math.max(0, Math.min(dayEnd.getTime(), offlineAt.getTime()) - Math.max(day.getTime(), onlineAt.getTime()));
                return total + Math.floor(overlapMs / 1_000);
            }, 0);
            return { day, seconds };
        });
        const maxOnlineDaily = Math.max(1, ...onlineDaily.map((item) => item.seconds));
        const statsByBoard = games.reduce((map, game) => {
            const id = game.boardID || t("dashboard.unknownBoard");
            const current = map.get(id) ?? { id, games: 0, playing: 0, completed: 0, moves: 0, duration: 0 };
            current.games += 1;
            current.completed += isFinished(game) ? 1 : 0;
            current.moves += game.totalMoves
                ?? (Array.isArray(game.fenHistory) ? Math.max(0, game.fenHistory.length - 1) : game.uciHistory?.length)
                ?? 0;
            current.duration += durationOf(game);
            map.set(id, current);
            return map;
        }, new Map<string, { id: string; games: number; playing: number; completed: number; moves: number; duration: number }>());
        for (const game of playingGames) {
            const id = game.boardID || t("dashboard.unknownBoard");
            const current = statsByBoard.get(id) ?? { id, games: 0, playing: 0, completed: 0, moves: 0, duration: 0 };
            current.playing += 1;
            if (!historyGameIds.has(game.gameID)) {
                current.games += 1;
                current.moves += Math.max(0, (game.fenHistory?.length ?? 1) - 1);
                current.duration += liveDurationOf(game);
            }
            statsByBoard.set(id, current);
        }
        for (const uptime of boardUptime) {
            if (!statsByBoard.has(uptime.boardID)) {
                statsByBoard.set(uptime.boardID, { id: uptime.boardID, games: 0, playing: 0, completed: 0, moves: 0, duration: 0 });
            }
        }
        const uptimeByBoard = new Map(boardUptime.map((item) => [item.boardID, item]));
        const boardStats = Array.from(statsByBoard.values())
            .map((board) => ({
                ...board,
                onlineDuration: uptimeByBoard.get(board.id)?.totalOnlineSec ?? 0,
                sessionCount: uptimeByBoard.get(board.id)?.sessionCount ?? 0,
                batteryVoltage: uptimeByBoard.get(board.id)?.batteryVoltage ?? null,
                batteryPercent: uptimeByBoard.get(board.id)?.batteryPercent ?? null,
                batteryState: uptimeByBoard.get(board.id)?.batteryState ?? null,
            }))
            .sort((a, b) => b.games - a.games);
        const players = Array.from(games.reduce((map, game) => {
            for (const [name, won] of [[game.whiteName, game.Result === "1-0"], [game.blackName, game.Result === "0-1"]] as const) {
                const current = map.get(name) ?? { name, games: 0, wins: 0, draws: 0 };
                current.games += 1;
                current.wins += won ? 1 : 0;
                current.draws += game.Result === "1/2-1/2" ? 1 : 0;
                map.set(name, current);
            }
            return map;
        }, new Map<string, { name: string; games: number; wins: number; draws: number }>()).values()).sort((a, b) => b.games - a.games).slice(0, 6);
        const sessions = onlineSessions
            .filter((session) => validDate(session.onlineAt) !== null)
            .sort((a, b) => (validDate(b.onlineAt)?.getTime() ?? 0) - (validDate(a.onlineAt)?.getTime() ?? 0));
        return { games, totalGames: games.length + liveGamesWithoutHistory.length, completedGames: completedGames.length, duration, results, maxResult, daily, maxDaily, onlineDaily, maxOnlineDaily, boardStats, players, sessions };
    }, [boardUptime, history, liveGames, onlineSessions, range, t]);

    if (!isAdmin) return <div className="p-6 text-center text-sm text-muted-foreground">{t("dashboard.accessDenied")}</div>;
    if (loading) return <div className="p-6 text-center text-sm text-muted-foreground">{t("dashboard.loading")}</div>;
    if (error) return <div className="p-6 text-center text-sm text-destructive">{t("dashboard.loadError")}</div>;

    const cards = [
        { label: t("dashboard.games"), value: data.totalGames, icon: BarChart3, tone: "text-primary bg-primary/10" },
        { label: t("dashboard.activeGames"), value: data.results.active, icon: Radio, tone: "text-info bg-info/10" },
        { label: t("dashboard.completedGames"), value: data.completedGames, icon: Trophy, tone: "text-success bg-success/10" },
        { label: t("dashboard.totalDuration"), value: formatDuration(data.duration), icon: Clock3, tone: "text-warning bg-warning/10" },
        { label: t("dashboard.boardsOnline"), value: boardUptime.filter((board) => board.online).length, icon: MonitorCog, tone: "text-accent-foreground bg-accent" },
    ];
    const formatDateTime = (value?: string | null) => validDate(value)?.toLocaleString(
        locale === "vi" ? "vi-VN" : "en-US",
        { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" },
    ) ?? "—";

    return <main className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
        <header className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div><h1 className="text-xl font-semibold tracking-tight">{t("nav.dashboard")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("dashboard.subtitle")}</p></div>
            <div className="inline-flex w-fit rounded-md border border-border bg-muted p-1">
                {([7, 30] as const).map((value) => <button key={value} type="button" onClick={() => setRange(value)} className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${range === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{value === 7 ? t("dashboard.last7Days") : t("dashboard.last30Days")}</button>)}
            </div>
        </header>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{cards.map(({ label, value, icon: Icon, tone }) => <article key={label} className="rounded-lg border border-border bg-card p-4 shadow-sm"><div className={`mb-3 flex size-8 items-center justify-center rounded-md ${tone}`}><Icon className="size-4" /></div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></article>)}</section>
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
            <article className="rounded-lg border border-border bg-card p-4 shadow-sm"><h2 className="font-semibold">{t("dashboard.gamesByDay")}</h2>{data.games.length === 0 ? <p className="py-14 text-center text-sm text-muted-foreground">{t("dashboard.noData")}</p> : <div className="mt-5 flex h-48 items-end gap-1.5 sm:gap-2">{data.daily.map(({ day, count }) => <div key={day.toISOString()} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2 text-center"><span className="text-[10px] tabular-nums text-muted-foreground">{count || ""}</span><div className="min-h-1 rounded-t-sm bg-primary/80 transition-[height]" style={{ height: `${Math.max(count ? 8 : 2, (count / data.maxDaily) * 100)}%` }} /><span className="truncate text-[10px] text-muted-foreground">{day.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US", { weekday: "short" })}</span></div>)}</div>}</article>
            <article className="rounded-lg border border-border bg-card p-4 shadow-sm"><h2 className="font-semibold">{t("dashboard.resultBreakdown")}</h2><div className="mt-5 space-y-4">{[[t("dashboard.whiteWins"), data.results.white, "bg-muted-foreground"], [t("dashboard.blackWins"), data.results.black, "bg-foreground"], [t("dashboard.draws"), data.results.draw, "bg-warning"], [t("dashboard.unfinished"), data.results.active, "bg-info"]].map(([label, value, color]) => <div key={String(label)}><div className="mb-1.5 flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="font-medium tabular-nums">{value}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${color}`} style={{ width: `${(Number(value) / data.maxResult) * 100}%` }} /></div></div>)}</div></article>
        </section>
        <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
            <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <h2 className="font-semibold">{t("dashboard.onlineByDay")}</h2>
                {data.onlineDaily.every((item) => item.seconds === 0) ? (
                    <p className="py-14 text-center text-sm text-muted-foreground">{t("dashboard.noOnlineSessions")}</p>
                ) : (
                    <div className="mt-5 flex h-48 items-end gap-1.5 sm:gap-2">
                        {data.onlineDaily.map(({ day, seconds }) => (
                            <div key={day.toISOString()} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2 text-center" title={`${day.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US")}: ${formatDuration(seconds)}`}>
                                <span className="truncate text-[10px] tabular-nums text-muted-foreground">{seconds > 0 ? formatDuration(seconds) : ""}</span>
                                <div className="min-h-1 rounded-t-sm bg-success/80 transition-[height]" style={{ height: `${Math.max(seconds ? 8 : 2, (seconds / data.maxOnlineDaily) * 100)}%` }} />
                                <span className="truncate text-[10px] text-muted-foreground">{day.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US", { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
                            </div>
                        ))}
                    </div>
                )}
            </article>
            <article className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <div className="border-b border-border p-4">
                    <h2 className="font-semibold">{t("dashboard.onlineSessions")}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{t("dashboard.onlineSessionsDescription")}</p>
                </div>
                {data.sessions.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">{t("dashboard.noOnlineSessions")}</p>
                ) : (
                    <div className="max-h-80 divide-y divide-border overflow-y-auto">
                        {data.sessions.map((session) => (
                            <div key={`${session.boardID}-${session.onlineAt}`} className="grid grid-cols-2 gap-x-4 gap-y-2 p-4 text-xs sm:grid-cols-[minmax(90px,0.7fr)_minmax(150px,1.2fr)_minmax(150px,1.2fr)_minmax(90px,0.7fr)] sm:items-center">
                                <div><span className="block text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">{t("common.chessboard")}</span><span className="flex items-center gap-2 font-medium"><span className={`size-2 rounded-full ${session.online ? "bg-success" : "bg-muted-foreground"}`} />{session.boardID}</span></div>
                                <div><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{t("dashboard.onlineFrom")}</span><span className="mt-0.5 block tabular-nums">{formatDateTime(session.onlineAt)}</span></div>
                                <div><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{t("dashboard.onlineTo")}</span><span className="mt-0.5 block tabular-nums">{session.online ? t("dashboard.stillOnline") : formatDateTime(session.offlineAt)}</span></div>
                                <div><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{t("dashboard.sessionDuration")}</span><span className="mt-0.5 block font-medium tabular-nums">{formatDuration(session.durationSec)}</span></div>
                            </div>
                        ))}
                    </div>
                )}
            </article>
        </section>
        <section className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-lg border border-border bg-card shadow-sm">
                <div className="border-b border-border p-4">
                    <h2 className="font-semibold">
                        {t("dashboard.boardActivity")}
                    </h2>
                </div>
                <div className="divide-y divide-border">
                    {data.boardStats.length === 0 ?
                        <p className="p-6 text-center text-sm text-muted-foreground">
                            {t("dashboard.noData")}</p> : data.boardStats.map((board) => {
                                const online = boardUptime.find((item) => item.boardID === board.id)?.online
                                    ?? boards.some((item) => item.boardID === board.id);
                                return <div key={board.id} className="flex items-center justify-between gap-3 p-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 font-medium"><span className={`size-2 rounded-full ${online ? "bg-success" : "bg-muted-foreground"}`} />{board.id}</div>
                                        <p className="mt-1 text-xs text-muted-foreground">{board.playing} {t("dashboard.playing")} · {board.completed} {t("dashboard.completed")} · {board.moves} {t("common.moves")}</p>
                                    </div>
                                    <div className="shrink-0 text-right"><p className="text-xs font-medium">{t("dashboard.totalDuration")}: {formatDuration(board.duration)}</p><p className="mt-1 text-xs font-medium">{t("dashboard.totalOnlineDuration")}: {formatDuration(board.onlineDuration)}</p><p className="mt-1 text-xs text-muted-foreground">{board.sessionCount} {t("dashboard.onlineSessionCount")}</p>{board.batteryPercent !== null && board.batteryVoltage !== null ? <p className={`mt-1 text-xs font-medium ${board.batteryState === "critical" ? "text-destructive" : board.batteryState === "low" ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>{t("dashboard.battery")}: {board.batteryPercent}% · {board.batteryVoltage.toFixed(2)} V</p> : <p className="mt-1 text-xs text-muted-foreground">{t("dashboard.battery")}: {t("dashboard.batteryUnknown")}</p>}<p className="mt-1 text-[11px] text-muted-foreground">{online ? t("dashboard.online") : t("dashboard.offline")}</p></div>
                                </div>;
                            })}</div></article>
            <article className="rounded-lg border border-border bg-card shadow-sm"><div className="border-b border-border p-4"><h2 className="font-semibold">{t("dashboard.playerActivity")}</h2></div><div className="divide-y divide-border">{data.players.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">{t("dashboard.noData")}</p> : data.players.map((player) => <div key={player.name} className="flex items-center justify-between gap-3 p-4"><div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><Users className="size-3.5" /></span><div><p className="text-sm font-medium">{player.name}</p><p className="text-xs text-muted-foreground">{player.games} {t("dashboard.games")}</p></div></div><div className="flex gap-3 text-right text-xs"><span><b className="block text-foreground">{player.wins}</b><span className="text-muted-foreground">{t("dashboard.wins")}</span></span><span><b className="block text-foreground">{player.draws}</b><span className="text-muted-foreground">{t("dashboard.draws")}</span></span></div></div>)}</div></article>
        </section>
    </main>;
}
