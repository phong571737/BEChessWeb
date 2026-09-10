"use client"

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { useGame } from "@/hooks/use-game";
import { ChessBoardView, type PredictedMove } from "@/components/board/chess-board-view";
import { useT } from "@/lib/i18n";
import { GamePanel } from "@/components/board/game-panel";
import { GameActions } from "@/components/board/game-actions";
import { useSocket } from "@/components/providers/socket-provider";
import { SOCKET_CONSTANTS, SERVER_EVENT } from "@/lib/constants/socket";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Trophy, Home, X, CircleCheckBig, CircleAlert, ScanLine, BarChart3, EyeOff, Lightbulb, FlipHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { GAME_STATUS } from "@/lib/constants/game";
import { EvalBar } from "@/components/board/eval-bar";
import { useStockfish } from "@/hooks/use-stockfish";
import { formatClockMs, useChessClock } from "@/hooks/use-chess-clock";
import { useAuth } from "@/components/providers/auth-provider";
import { classifyTimeControl } from "@/lib/time-control";

interface Props {
    gameID: string;
    /** Multi-board cell: board + names only (no side panel / stockfish) */
    compact?: boolean;
    /** Run Stockfish eval (full single-board view only) */
    enableEval?: boolean;
    /** Dedicated full-height presentation used by the two-board layout. */
    twoBoardLayout?: boolean;
    /** In multi-view: clear this slot instead of redirecting home */
    onUnavailable?: () => void;
    /** Allow removing this slot from multi-view */
    onRemove?: () => void;
    /** Open picker to choose a different game for this slot */
    onChangeGame?: () => void;
    className?: string;
}

function SlotSkeleton({ compact }: { compact?: boolean }) {
    if (compact) {
        return (
            <div className="h-full flex flex-col gap-2 p-2 border border-border rounded-sm">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="flex-1 min-h-[120px] w-full" />
            </div>
        );
    }
    return (
        <div className="p-2 sm:p-3 sm:h-full">
            <div className="max-w-[1600px] mx-auto sm:h-full">
                <div className="
          grid grid-cols-1 gap-2 items-start
          sm:gap-3 sm:h-full sm:items-stretch
          sm:grid-cols-[minmax(0,1fr)_clamp(240px,30vw,310px)]
          lg:grid-cols-[minmax(0,1fr)_clamp(300px,24vw,380px)]
        ">
                    <div className="flex flex-col gap-2 sm:h-full sm:min-h-0">
                        <div className="flex gap-1.5 sm:flex-1 sm:min-h-0">
                            <Skeleton className="flex-1 aspect-square sm:aspect-auto sm:min-h-0" />
                            <Skeleton className="hidden sm:block w-[22px] shrink-0 h-full" />
                        </div>
                        <Skeleton className="h-5 sm:hidden" />
                    </div>
                    <div className="flex flex-col gap-2 sm:h-full">
                        <Skeleton className="h-9" />
                        <Skeleton className="h-16" />
                        <Skeleton className="h-[clamp(180px,35vh,280px)] sm:flex-1 sm:h-auto" />
                        <Skeleton className="h-9" />
                        <Skeleton className="h-12" />
                    </div>
                </div>
            </div>
        </div>
    );
}

interface GameEndViewProps {
    result: string | null;
    whiteName: string;
    blackName: string;
    fen: string;
    compact?: boolean;
    onDismiss?: () => void;
}

function GameEndView({ result, whiteName, blackName, fen, compact, onDismiss }: GameEndViewProps) {
    const { t } = useT();
    const boardWrapRef = useRef<HTMLDivElement>(null);
    const [boardWidth, setBoardWidth] = useState(0);

    useEffect(() => {
        const el = boardWrapRef.current;
        if (!el) return;
        const measure = () => {
            const max = compact ? el.clientWidth : Math.min(el.clientWidth, 480);
            setBoardWidth(Math.max(80, max));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [compact]);

    const isDraw = result === "1/2-1/2";
    const whiteWins = result === "1-0";
    const blackWins = result === "0-1";
    const hasResult = isDraw || whiteWins || blackWins;

    const resultLabel = isDraw
        ? t("result.draw")
        : whiteWins
            ? t("result.whiteWin")
            : blackWins
                ? t("result.blackWin")
                : t("board.gameEnded");

    const winnerName = isDraw ? null : whiteWins ? whiteName : blackName;
    const loserName = isDraw ? null : whiteWins ? blackName : whiteName;

    if (compact) {
        return (
            <div className="h-full flex flex-col border border-border rounded-sm overflow-hidden bg-background">
                <div className="px-2.5 py-1.5 border-b border-border flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">{t("board.gameEnded")}</span>
                    {onDismiss && (
                        <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={onDismiss} title={t("board.removeSlot")}>
                            <X className="size-3.5" />
                        </Button>
                    )}
                </div>
                <div ref={boardWrapRef} className="flex-1 min-h-0 flex items-center justify-center p-2 opacity-80">
                    {boardWidth >= 80 ? (
                        <ChessBoardView fen={fen} lastMove={null} boardWidth={boardWidth} />
                    ) : (
                        <div className="w-full aspect-square bg-muted animate-pulse" />
                    )}
                </div>
                <div className="px-2.5 py-2 border-t border-border text-center">
                    <p className="text-xs font-medium">
                        {hasResult ? `${result} — ${resultLabel}` : resultLabel}
                    </p>
                    {winnerName && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{winnerName} {t("board.winner")}</p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-h))] p-4 sm:p-6">
            <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6 lg:gap-8 w-full max-w-[860px]">
                <div
                    ref={boardWrapRef}
                    className="w-full max-w-[480px] shrink-0 rounded overflow-hidden ring-2 ring-border/40"
                >
                    {boardWidth >= 80 ? (
                        <ChessBoardView fen={fen} lastMove={null} boardWidth={boardWidth} />
                    ) : (
                        <div className="w-full aspect-square bg-muted animate-pulse" />
                    )}
                </div>

                <div className="flex flex-col gap-5 lg:pt-3 items-center lg:items-start text-center lg:text-left w-full max-w-[320px]">
                    <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-full bg-[#f0f0f0] border border-black/15 shrink-0" />
                            {whiteName}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50">vs</span>
                        <span className="flex items-center gap-1.5">
                            {blackName}
                            <span className="size-2.5 rounded-full bg-[#1a1a1a] border border-white/10 shrink-0" />
                        </span>
                    </div>

                    <div className="flex flex-col items-center lg:items-start gap-3">
                        <div className={cn(
                            "size-14 rounded-full flex items-center justify-center",
                            isDraw ? "bg-yellow-500/10" : "bg-green-500/10"
                        )}>
                            <Trophy className={cn("size-7", isDraw ? "text-yellow-500" : "text-green-500")} />
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-base font-semibold">{t("board.gameEnded")}</h2>
                            {hasResult && (
                                <p className="text-sm font-medium">{result} — {resultLabel}</p>
                            )}
                            {isDraw ? (
                                <p className="text-xs text-muted-foreground">{t("board.drawAgreed")}</p>
                            ) : hasResult && winnerName && loserName ? (
                                <p className="text-xs text-muted-foreground">{t("board.resignedBy")}</p>
                            ) : null}
                        </div>
                        {!isDraw && winnerName && loserName && (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="size-2.5 rounded-full bg-green-500/80 shrink-0" />
                                    <span className="font-medium">{winnerName}</span>
                                    <span className="text-muted-foreground">{t("board.winner")}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="size-2.5 rounded-full bg-red-500/60 shrink-0" />
                                    <span className="font-medium text-foreground">{loserName}</span>
                                    <span>{t("board.resignedBy")}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/"><Home className="size-3.5 mr-1.5" />{t("nav.home")}</Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/played">{t("board.viewHistory")}</Link>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function BoardViewSlot({
    gameID,
    compact = false,
    enableEval = false,
    twoBoardLayout = false,
    onUnavailable,
    onRemove,
    onChangeGame,
    className,
}: Props) {
    const { t } = useT();
    const { isAdmin, isAuthenticated } = useAuth();
    const router = useRouter();
    const socket = useSocket();
    // These switches are local to the currently viewed game, so multi-board
    // layouts can configure each board independently.
    const [showLiveEvaluation, setShowLiveEvaluation] = useState(true);
    const [showLiveSuggestions, setShowLiveSuggestions] = useState(true);
    const [boardFlipped, setBoardFlipped] = useState(false);
    useEffect(() => {
        setShowLiveEvaluation(localStorage.getItem(`live-show-evaluation-${gameID}`) !== "false");
        setShowLiveSuggestions(localStorage.getItem(`live-show-suggestions-${gameID}`) !== "false");
        setBoardFlipped(localStorage.getItem(`board-flipped-${gameID}`) === "true");
    }, [gameID]);
    // Evaluation and suggestions are controlled independently per board slot.
    const evaluationEnabled = enableEval && (showLiveEvaluation || showLiveSuggestions);
    const evaluationBarVisible = evaluationEnabled && showLiveEvaluation;
    const { workerRef, onMessageRef, isReady, hasError: stockfishUnavailable } = useStockfish(evaluationEnabled);
    const pendingFenRef = useRef<string | null>(null);
    const activeSearchRef = useRef<{ fen: string; depth: number } | null>(null);
    const stopRequestedRef = useRef(false);
    const startSearchRef = useRef<() => void>(() => undefined);
    const [cp, setCp] = useState<number | null>(null);
    const [mate, setMate] = useState<number | null>(null);
    const [predictedMove, setPredictedMove] = useState<PredictedMove | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const currentFenRef = useRef<string | null>(null);
    const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
    const redirectTimerRef = useRef<number | null>(null);
    const boardWrapRef = useRef<HTMLDivElement | null>(null);
    const [boardWidth, setBoardWidth] = useState(0);
    const unavailableHandled = useRef(false);

    const {
        fen, pgn, whiteName, blackName, lastMove, result, isLoaded, loadError, restart, resign, lastMoveAt, moveTimesMap, status,
        missingSquares, extraSquares, wrongPieceSquares, branches, mainPgnBeforeBranch, selectBranch, selectedBranchId, moves, initStatus,
        initialTimeMs, incrementMs, whiteRemainingMs, blackRemainingMs, activeClockSide, clockStartedAt, serverNow, resetRevision, round, location, initialFen, fenHistory, boardNumber, liveDataWarning,
    } = useGame(gameID);
    const physicalBoard = useGameStore((state) => state.physicalBoards.find((board) => board.gameID === gameID));
    const boardLabel = physicalBoard?.boardID ?? `Board-${gameID.slice(0, 8)}`;
    const compactBoardLabel = boardNumber?.trim() ? t("common.boardNumber", { n: boardNumber.trim() }) : boardLabel;
    const timeControlType = classifyTimeControl(initialTimeMs, incrementMs);
    const timeControlLabel = t(`timeControl.${timeControlType}` as "timeControl.blitz" | "timeControl.rapid" | "timeControl.classical");

    const { whiteMs, blackMs, activeSide } = useChessClock({
        gameID,
        fen,
        pgn,
        status,
        isLoaded,
        moveCount: moves.length,
        initialTimeMs,
        incrementMs,
        whiteRemainingMs,
        blackRemainingMs,
        activeClockSide,
        clockStartedAt,
        serverNow,
        resetRevision,
    });

    const prevFenRef = useRef<string>(fen);
    const [navigationState, setNavigationState] = useState<{
        fen: string | null;
        lastMove: { from: string; to: string } | null;
    }>({ fen: null, lastMove: null });

    const displayFen = navigationState.fen ?? fen;
    const displayLastMove = navigationState.fen ? navigationState.lastMove : lastMove;

    const toggleBoardFlip = useCallback(() => {
        setBoardFlipped((value) => {
            const next = !value;
            localStorage.setItem(`board-flipped-${gameID}`, String(next));
            return next;
        });
    }, [gameID]);
    const initNotice = isAuthenticated && status !== GAME_STATUS.PLAYING
        ? initStatus === GAME_STATUS.READY
            ? { icon: CircleCheckBig, className: "border-success/35 bg-success/10 text-success", text: t("board.initReady") }
            : initStatus === "waiting_button"
                ? { icon: CircleAlert, className: "border-warning/35 bg-warning/10 text-warning", text: t("board.initButton") }
                : initStatus === "missing_piece" || initStatus === "wrong_piece"
                    ? { icon: CircleAlert, className: "border-destructive/35 bg-destructive/10 text-destructive", text: t("board.initPieces") }
                    // A newly created/restarted physical board begins as "idle"
                    // until its first initcheck arrives from the ESP32. Treat it
                    // as a pending initialization state so the page does not
                    // silently omit the status notice during that interval.
                    : initStatus === GAME_STATUS.CHECK_INIT
                        ? { icon: ScanLine, className: "border-info/35 bg-info/10 text-info", text: t("board.initChecking") }
                        : initStatus === GAME_STATUS.WAITING || initStatus === "idle"
                            ? { icon: ScanLine, className: "border-info/35 bg-info/10 text-info", text: t("board.initWaiting") }
                        : null
                        : null;
    const warningReasons = liveDataWarning?.issues.map((issue) => t(
        issue === "invalid_fen"
            ? "board.invalidFenWarning"
            : issue === "fen_uci_mismatch"
                ? "board.fenUciMismatchWarning"
                : "board.uciXWarning",
    )) ?? [];
    const warningReason = warningReasons.reduce<string | undefined>((combined, reason) =>
        combined ? t("board.dataWarningMultiple", { first: combined, second: reason }) : reason,
    undefined);
    const warningText = warningReason && liveDataWarning?.seq !== undefined
        ? t("board.dataWarningAtSeq", { reason: warningReason, seq: liveDataWarning.seq })
        : warningReason;
    const boardNotice = isAdmin && warningText
        ? { icon: CircleAlert, className: "border-destructive/35 bg-destructive/10 text-destructive", text: warningText }
        : initNotice;

    const handleUnavailable = useCallback(() => {
        if (unavailableHandled.current) return;
        unavailableHandled.current = true;
        if (onUnavailable) {
            onUnavailable();
            return;
        }
        setOfflineNotice(t("board.offlineRedirect"));
        if (redirectTimerRef.current) window.clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = window.setTimeout(() => {
            router.replace("/");
        }, 1500);
    }, [onUnavailable, router, t]);

    useEffect(() => {
        if (!loadError) return;
        if (loadError === "not-found") handleUnavailable();
    }, [loadError, handleUnavailable]);

    useEffect(() => {
        if (!socket || !gameID) return;

        const onEspMove = (rawData: any) => {
            const data = Array.isArray(rawData) && rawData.length === 1 ? rawData[0] : rawData;
            if (!data || data.gameID !== gameID) return;
            setNavigationState({ fen: null, lastMove: null });
        };

        const onGameDestroyed = (data: any) => {
            if (!data) return;
            const gameIDs = Array.isArray(data.gameIDs) ? data.gameIDs : [];
            if (gameIDs.includes(gameID)) handleUnavailable();
        };

        const onBoardOffline = (data: any) => {
            if (!data || !data.boardID) return;
            try {
                const boards = useGameStore.getState().physicalBoards;
                const b = boards.find((x: any) => x.boardID === data.boardID && x.gameID === gameID);
                if (b) handleUnavailable();
            } catch {
                // ignore
            }
        };

        socket.on(SOCKET_CONSTANTS.GAME_DESTROYED, onGameDestroyed);
        socket.on(SOCKET_CONSTANTS.BOARD_OFFLINE, onBoardOffline);
        socket.on(SERVER_EVENT.ESP_MOVE, onEspMove);
        return () => {
            socket.off(SOCKET_CONSTANTS.GAME_DESTROYED, onGameDestroyed);
            socket.off(SOCKET_CONSTANTS.BOARD_OFFLINE, onBoardOffline);
            socket.off(SERVER_EVENT.ESP_MOVE, onEspMove);
            if (redirectTimerRef.current) {
                window.clearTimeout(redirectTimerRef.current);
            }
        };
    }, [socket, gameID, handleUnavailable]);

    const startNextSearch = useCallback(() => {
        if (!evaluationEnabled || !isReady || activeSearchRef.current) return;
        const fenToAnalyze = pendingFenRef.current;
        const worker = workerRef.current;
        if (!fenToAnalyze || !worker) {
            if (!fenToAnalyze) setIsAnalyzing(false);
            return;
        }

        pendingFenRef.current = null;
        stopRequestedRef.current = false;
        activeSearchRef.current = { fen: fenToAnalyze, depth: -1 };
        setIsAnalyzing(true);
        worker.postMessage(`position fen ${fenToAnalyze}`);
        worker.postMessage("go depth 16");
    }, [evaluationEnabled, isReady, workerRef]);

    useEffect(() => {
        startSearchRef.current = startNextSearch;
    }, [startNextSearch]);

    useEffect(() => {
        if (!evaluationEnabled) return;
        onMessageRef.current = (line: string) => {
            const activeSearch = activeSearchRef.current;
            if (line.startsWith("bestmove")) {
                if (!activeSearch) return;
                // A stopped search may still emit its bestmove after the
                // board has advanced. Discard that stale result and start the
                // pending search instead of leaving the old position active.
                if (activeSearch.fen !== currentFenRef.current) {
                    activeSearchRef.current = null;
                    stopRequestedRef.current = false;
                    startSearchRef.current();
                    return;
                }
                const bestMove = line.trim().split(/\s+/)[1] ?? "";
                setPredictedMove(showLiveSuggestions && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove)
                    ? { from: bestMove.slice(0, 2) as PredictedMove["from"], to: bestMove.slice(2, 4) as PredictedMove["to"] }
                    : null);
                activeSearchRef.current = null;
                stopRequestedRef.current = false;
                startSearchRef.current();
                return;
            }

            if (!activeSearch || !line.startsWith("info ") || activeSearch.fen !== currentFenRef.current) return;
            const multiPv = line.match(/\bmultipv (\d+)/);
            if (multiPv && Number(multiPv[1]) !== 1) return;
            const depthMatch = line.match(/\bdepth (\d+)/);
            const depth = depthMatch ? Number(depthMatch[1]) : -1;
            if (depth < activeSearch.depth) return;
            activeSearch.depth = depth;

            const isBlackToMove = activeSearch.fen.split(" ")[1] === "b";
            const cpMatch = line.match(/\bscore cp (-?\d+)/);

            if (cpMatch) {
                let val = Number(cpMatch[1]);
                if (isBlackToMove) val = -val;
                if (showLiveEvaluation) {
                    setCp(val);
                    setMate(null);
                }
                return;
            }

            const mateMatch = line.match(/\bscore mate (-?\d+)/);
            if (mateMatch) {
                let mateIn = Number(mateMatch[1]);
                if (isBlackToMove) mateIn = -mateIn;
                if (showLiveEvaluation) {
                    setMate(mateIn);
                    setCp(null);
                }
            }
        };
        return () => {
            onMessageRef.current = null;
        };
    }, [evaluationEnabled, onMessageRef, showLiveEvaluation, showLiveSuggestions]);

    useEffect(() => {
        if (!evaluationEnabled || !displayFen) {
            pendingFenRef.current = null;
            activeSearchRef.current = null;
            stopRequestedRef.current = false;
            setIsAnalyzing(false);
            setPredictedMove(null);
            return;
        }

        currentFenRef.current = displayFen;
        pendingFenRef.current = displayFen;
        setCp(null);
        setMate(null);
        setPredictedMove(null);

        const worker = workerRef.current;
        if (activeSearchRef.current) {
            if (worker && !stopRequestedRef.current) {
                stopRequestedRef.current = true;
                worker.postMessage("stop");
            }
            return;
        }
        startNextSearch();
        // Re-run the current position when either live output is toggled back
        // on.  The engine remains enabled while only one output is hidden,
        // so depending solely on `evaluationEnabled` would leave the cleared
        // score/suggestion empty until a page reload or a new move.
    }, [
        displayFen,
        isReady,
        evaluationEnabled,
        showLiveEvaluation,
        showLiveSuggestions,
        startNextSearch,
        workerRef,
    ]);

    useEffect(() => {
        const el = boardWrapRef.current;
        if (!el) return;
        const measure = () => {
            const rect = el.getBoundingClientRect();
            const w = Math.floor(rect.width);
            const h = rect.height > 40
                ? Math.floor(rect.height)
                : Math.floor(window.innerHeight - rect.top - 80);
            const mobileTwoBoard = twoBoardLayout && window.innerWidth < 1024;
            const availableHeight = h;
            const minSize = compact ? (mobileTwoBoard ? 64 : 120) : 200;
            const next = Math.max(minSize, Math.min(w, availableHeight) - 4);
            setBoardWidth(next);
        };
        measure();
        requestAnimationFrame(measure);
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        window.addEventListener("resize", measure);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [isLoaded, compact, twoBoardLayout]);

    useEffect(() => {
        if (fen !== prevFenRef.current) {
            prevFenRef.current = fen;
            setNavigationState({ fen: null, lastMove: null });
        }
    }, [fen]);

    const handleNavigate = useCallback((nextFen: string | null, lm: { from: string; to: string } | null) => {
        setNavigationState({ fen: nextFen, lastMove: lm });
    }, []);

    const toggleLiveEvaluation = useCallback(() => {
        setShowLiveEvaluation((visible) => {
            const next = !visible;
            localStorage.setItem(`live-show-evaluation-${gameID}`, String(next));
            if (!next) {
                setCp(null);
                setMate(null);
            }
            return next;
        });
    }, [gameID]);

    const toggleLiveSuggestions = useCallback(() => {
        setShowLiveSuggestions((visible) => {
            const next = !visible;
            localStorage.setItem(`live-show-suggestions-${gameID}`, String(next));
            if (!next) setPredictedMove(null);
            return next;
        });
    }, [gameID]);

    if (offlineNotice && !compact) {
        return (
            <div className="p-6 min-h-[calc(100vh-var(--header-h))] flex flex-col items-center justify-center text-center">
                <div className="rounded-xl border border-border bg-background/80 p-6 shadow-sm">
                    <p className="text-sm text-muted-foreground mb-2">{offlineNotice}</p>
                    <p className="text-xs text-muted-foreground">{t("board.viewHistory")}</p>
                </div>
            </div>
        );
    }

    if (!isLoaded) return <SlotSkeleton compact={compact} />;

    if (status === GAME_STATUS.ENDED) {
        return (
            <GameEndView
                result={result}
                whiteName={whiteName}
                blackName={blackName}
                fen={fen}
                compact={compact}
                onDismiss={onRemove}
            />
        );
    }

    if (compact) {
        return (
            <div className={cn(
                "relative h-full min-h-0 flex flex-col border border-border rounded-sm overflow-hidden bg-background",
                twoBoardLayout && "lg:flex-col lg:grid-cols-none lg:grid-rows-none grid grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)] grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)_auto]",
                className
            )}>
                {twoBoardLayout && (
                    <div className={cn(
                        "col-span-2 row-start-1 grid min-h-5 items-center gap-1 px-1 py-0.5 lg:hidden",
                        isAdmin && boardNotice ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1"
                    )}>
                        {isAdmin && boardNotice ? (
                            <span className={cn("flex min-w-0 items-center gap-1 rounded-sm border px-1 py-0.5 text-[9px] font-medium", boardNotice.className)} role={warningText ? "alert" : "status"}>
                                <boardNotice.icon className="size-2.5 shrink-0" />
                                <span className="truncate">{boardNotice.text}</span>
                            </span>
                        ) : <span />}
                        <span className={cn(
                            "shrink-0 whitespace-nowrap text-[10px] font-medium text-muted-foreground",
                            isAdmin && boardNotice ? "justify-self-end" : "justify-self-center"
                        )}>
                            {compactBoardLabel} · {timeControlLabel}
                        </span>
                    </div>
                )}
                {!twoBoardLayout && boardNotice && (
                    <div className={cn("mx-2 mt-2 flex items-center gap-2 rounded-sm border px-2.5 py-2 text-xs font-medium", boardNotice.className)} role={warningText ? "alert" : "status"}>
                        <boardNotice.icon className="size-3.5 shrink-0" />
                        <span className="truncate">{boardNotice.text}</span>
                    </div>
                )}
                <div className={cn(
                    "flex min-h-0 flex-1 flex-col items-stretch",
                    twoBoardLayout ? "contents lg:flex lg:px-2 lg:py-1.5" : "justify-center px-2 pb-1 pt-1.5"
                )}>
                    <div
                        className={cn(
                            "shrink-0 pb-1 text-xs font-semibold text-foreground",
                            twoBoardLayout && "col-start-1 row-start-2 self-start px-1 w-auto lg:col-auto lg:row-auto lg:self-auto lg:px-0 lg:w-[var(--board-width)]"
                        )}
                        style={twoBoardLayout && boardWidth > 0 ? { "--board-width": `${boardWidth}px` } as React.CSSProperties : undefined}
                    >
                        {twoBoardLayout && isAdmin && boardNotice && (
                            <div className={cn("mb-1 hidden items-center gap-1 rounded-sm border px-1.5 py-1 text-[10px] font-medium lg:flex", boardNotice.className)} role={warningText ? "alert" : "status"}>
                                <boardNotice.icon className="size-3 shrink-0" />
                                <span className="truncate">{boardNotice.text}</span>
                            </div>
                        )}
                        <CompactPlayer
                            name={boardFlipped ? whiteName : blackName}
                            side={boardFlipped ? "white" : "black"}
                            timeMs={boardFlipped ? whiteMs : blackMs}
                            activeSide={activeSide}
                            highlightActive={!twoBoardLayout}
                            labelHiddenMobile={twoBoardLayout}
                            desktopAtLarge={twoBoardLayout}
                            label={`${compactBoardLabel} · ${timeControlLabel}`}
                        />
                    </div>
                    <div className={cn(
                        "relative flex min-h-0 flex-1 items-stretch",
                        twoBoardLayout && "col-start-2 row-start-2 row-span-2 min-h-0 lg:col-auto lg:row-auto lg:row-span-auto"
                    )}>
                        <div ref={boardWrapRef} className={cn(
                            "flex min-w-0 flex-1 items-start",
                            twoBoardLayout ? "justify-start lg:items-center" : "justify-center md:items-center"
                        )}>
                            <ChessBoardView
                                fen={displayFen}
                            lastMove={displayLastMove}
                            boardWidth={boardWidth}
                            missingSquares={missingSquares}
                            extraSquares={extraSquares}
                            wrongPieceSquares={wrongPieceSquares}
                                predictedMove={predictedMove}
                                flipped={boardFlipped}
                            />
                        </div>
                        {evaluationBarVisible && (
                            <div
                                className={cn("w-[22px] shrink-0", twoBoardLayout && "ml-auto self-start")}
                                style={twoBoardLayout && boardWidth > 0 ? { height: boardWidth } : undefined}
                            >
                                <EvalBar cp={cp} mate={mate} flipped={boardFlipped} isAnalyzing={isAnalyzing} engineUnavailable={stockfishUnavailable} />
                            </div>
                        )}
                    </div>
                    <div className={cn(
                        "shrink-0 pt-1 text-xs font-semibold text-foreground",
                        twoBoardLayout && "col-start-1 row-start-3 self-end px-1 w-auto lg:col-auto lg:row-auto lg:self-auto lg:px-0 lg:w-[var(--board-width)]"
                    )}
                        style={twoBoardLayout && boardWidth > 0 ? { "--board-width": `${boardWidth}px` } as React.CSSProperties : undefined}
                    >
                        <CompactPlayer
                            name={boardFlipped ? blackName : whiteName}
                            side={boardFlipped ? "black" : "white"}
                            timeMs={boardFlipped ? blackMs : whiteMs}
                            activeSide={activeSide}
                            highlightActive={!twoBoardLayout}
                            desktopAtLarge={twoBoardLayout}
                        />
                        {twoBoardLayout && isAdmin && (
                            <div className="hidden lg:block">
                                <GameActions
                                    gameID={gameID}
                                    onRestart={restart}
                                    onResign={resign}
                                    branches={branches}
                                    isAuthenticated={isAuthenticated}
                                    compact
                                />
                            </div>
                        )}
                    </div>
                    {twoBoardLayout && isAdmin && (
                        <div className="col-span-2 row-start-4 lg:hidden">
                            <GameActions
                                gameID={gameID}
                                onRestart={restart}
                                onResign={resign}
                                branches={branches}
                                isAuthenticated={isAuthenticated}
                                compact
                            />
                        </div>
                    )}
                </div>
                {!twoBoardLayout && (
                    <GameActions
                        gameID={gameID}
                        onRestart={restart}
                        onResign={resign}
                        branches={branches}
                        isAuthenticated={isAuthenticated}
                    />
                )}
            </div>
        );
    }

    return (
        <div className={cn("flex flex-col h-full min-h-0", className)}>
            {(boardNotice || enableEval) && (
                <div className={cn(
                    "relative items-center gap-2 px-2 pt-2 sm:flex sm:px-3",
                    boardNotice ? "flex" : "hidden"
                )}>
                    {boardNotice && (
                        <div className={cn("flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium", boardNotice.className)} role={warningText ? "alert" : "status"}>
                            <boardNotice.icon className="size-4 shrink-0" />
                            <span className="truncate">{boardNotice.text}</span>
                        </div>
                    )}
                    {enableEval && (
                        <div className="hidden flex-nowrap justify-end gap-2 sm:ml-auto sm:flex">
                            <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 whitespace-nowrap" onClick={toggleBoardFlip}>
                                <FlipHorizontal className="size-3.5" />
                                {t("settings.flipBoard")}
                            </Button>
                            <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 whitespace-nowrap" onClick={toggleLiveEvaluation}>
                                <BarChart3 className="size-3.5" />
                                {showLiveEvaluation ? t("analysis.hideEvaluation") : t("analysis.showEvaluation")}
                            </Button>
                            <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 whitespace-nowrap" onClick={toggleLiveSuggestions}>
                                {showLiveSuggestions ? <EyeOff className="size-3.5" /> : <Lightbulb className="size-3.5" />}
                                {showLiveSuggestions ? t("analysis.hideMoveSuggestions") : t("analysis.showMoveSuggestions")}
                            </Button>
                        </div>
                    )}
                </div>
            )}
            <div className="flex-1 min-h-0 p-2 sm:p-3">
                <div className="max-w-[1600px] mx-auto h-full">
                    <div className="grid grid-cols-1 gap-2 items-start
                     sm:gap-3 h-full sm:items-stretch
                    sm:grid-cols-[minmax(0,1fr)_clamp(240px,30vw,310px)]
                    lg:grid-cols-[minmax(0,1fr)_clamp(300px,24vw,380px)]
                    ">
                        <div className="flex flex-col gap-2 sm:h-full sm:min-h-0">
                            <div className="sm:hidden">
                                <CompactPlayer
                                    name={boardFlipped ? whiteName : blackName}
                                    side={boardFlipped ? "white" : "black"}
                                    timeMs={boardFlipped ? whiteMs : blackMs}
                                    activeSide={activeSide}
                                    mobileInline
                                />
                            </div>
                            <div className="flex gap-1.5 min-w-0 sm:flex-1 sm:min-h-0 items-stretch">
                                <div
                                    ref={boardWrapRef}
                                    className="
                                    flex-1 min-w-0 aspect-square flex
                                    items-center justify-center sm:aspect-auto sm:min-h-0
                                    "
                                >
                                    <ChessBoardView
                                        fen={displayFen}
                                        lastMove={displayLastMove}
                                        boardWidth={boardWidth}
                                        missingSquares={missingSquares}
                                        extraSquares={extraSquares}
                                        wrongPieceSquares={wrongPieceSquares}
                                        predictedMove={predictedMove}
                                        flipped={boardFlipped}
                                    />
                                </div>

                                {evaluationBarVisible && (
                                    <div
                                        className="hidden sm:block w-[22px] shrink-0 self-start"
                                        style={boardWidth > 0 ? { height: boardWidth } : undefined}
                                    >
                                    <EvalBar cp={cp} mate={mate} flipped={boardFlipped} isAnalyzing={isAnalyzing} engineUnavailable={stockfishUnavailable} />
                                    </div>
                                )}
                            </div>

                            <div className="sm:hidden">
                                <CompactPlayer
                                    name={boardFlipped ? blackName : whiteName}
                                    side={boardFlipped ? "black" : "white"}
                                    timeMs={boardFlipped ? blackMs : whiteMs}
                                    activeSide={activeSide}
                                    mobileInline
                                />
                            </div>

                            {evaluationBarVisible && (
                                <div className="sm:hidden">
                                    <EvalBar cp={cp} mate={mate} orientation="horizontal" flipped={boardFlipped} isAnalyzing={isAnalyzing} engineUnavailable={stockfishUnavailable} />
                                </div>
                            )}
                        </div>

                        <div className="sm:h-full sm:min-h-0">
                            <GamePanel
                                gameID={gameID}
                                whiteName={whiteName}
                                blackName={blackName}
                                fen={displayFen}
                                pgn={pgn}
                                initialFen={initialFen}
                                timelineFens={fenHistory}
                                status={status}
                                lastMoveAt={lastMoveAt}
                                onRestart={restart}
                                onResign={resign}
                                moveTimesMap={moveTimesMap}
                                onNavigate={handleNavigate}
                                branches={branches}
                                onBranchSelect={selectBranch}
                                mainPgnBeforeBranch={mainPgnBeforeBranch}
                                selectedBranchId={selectedBranchId}
                                whiteClockMs={whiteMs}
                                blackClockMs={blackMs}
                                activeClockSide={activeSide}
                                isAuthenticated={isAuthenticated}
                                isAdmin={isAdmin}
                                flipped={boardFlipped}
                                initialTimeMs={initialTimeMs}
                                incrementMs={incrementMs}
                                round={round}
                                boardNumber={boardNumber}
                                boardID={boardLabel}
                                location={location}
                                initStatus={initStatus}
                                showBoardDisplayControls={enableEval}
                                showLiveEvaluation={showLiveEvaluation}
                                showLiveSuggestions={showLiveSuggestions}
                                onToggleBoardFlip={toggleBoardFlip}
                                onToggleLiveEvaluation={toggleLiveEvaluation}
                                onToggleLiveSuggestions={toggleLiveSuggestions}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CompactPlayer({
    name,
    side,
    timeMs,
    activeSide,
    label,
    highlightActive = true,
    labelHiddenMobile = false,
    desktopAtLarge = false,
    mobileInline = false,
}: {
    name: string;
    side: "white" | "black";
    timeMs: number;
    activeSide: "white" | "black";
    label?: string;
    highlightActive?: boolean;
    labelHiddenMobile?: boolean;
    desktopAtLarge?: boolean;
    mobileInline?: boolean;
}) {
    const active = side === activeSide;
    const mobileTurnColor = side === "white"
        ? "border-l-green-500 bg-green-500/10 text-green-700 dark:text-green-400"
        : "border-l-red-500 bg-red-500/10 text-red-600 dark:text-red-400";
    return (
        <div className={cn(
            "relative mx-auto grid w-full items-center gap-x-2 gap-y-0 rounded-sm px-1 py-1 transition-colors",
            mobileInline ? "grid-cols-[minmax(0,1fr)_auto] grid-rows-none" : "grid-cols-1 grid-rows-[auto_auto]",
            mobileInline && "border-l-[3px] border-l-transparent",
            desktopAtLarge
                ? "lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:grid-rows-none"
                : "md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:grid-rows-none",
            active && highlightActive && (mobileInline ? mobileTurnColor : "bg-accent text-foreground")
        )}>
            <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-2">
                <span className={cn("break-words", desktopAtLarge ? "lg:truncate" : "md:truncate")}>{name}</span>
            </span>
            <span className={cn(
                mobileInline ? "col-start-2 row-start-1 justify-self-end" : "col-start-1 row-start-2 justify-self-start",
                "font-mono text-sm tabular-nums",
                desktopAtLarge
                    ? "lg:col-auto lg:row-auto lg:justify-self-center"
                    : "md:col-auto md:row-auto md:justify-self-center",
                active
                    ? cn("font-bold", mobileInline
                        ? (side === "white" ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400")
                        : "text-foreground")
                    : "text-muted-foreground"
            )}>
                {formatClockMs(timeMs)}
            </span>
            <span className={cn(
                "absolute left-1/2 justify-self-center -translate-x-1/2 text-xs font-medium text-muted-foreground",
                desktopAtLarge
                    ? "lg:static lg:translate-x-0 lg:justify-self-end"
                    : "md:static md:translate-x-0 md:justify-self-end",
                labelHiddenMobile && (desktopAtLarge ? "hidden lg:block" : "hidden md:block")
            )}>{label}</span>
        </div>
    );
}

export { SlotSkeleton as BoardSlotSkeleton };
