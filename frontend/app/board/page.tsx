"use client"

import { decodeGameID } from "@/lib/id-utils";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useGameStore } from "@/lib/store";
import { useGame } from "@/hooks/use-game";
import { ChessBoardView } from "@/components/board/chess-board-view";
import { useT } from "@/lib/i18n";
import { GamePanel } from "@/components/board/game-panel";
import { useSocket } from "@/components/providers/socket-provider";
import { SOCKET_CONSTANTS, SERVER_EVENT } from "@/lib/constants/socket";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Trophy, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { GAME_STATUS } from "@/lib/constants/game";
import { EvalBar } from "@/components/board/eval-bar";
import { useStockfish } from "@/hooks/use-stockfish";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function BoardSkeleton() {
    return (
        <div className="p-2 sm:p-3 sm:h-[calc(100vh-var(--header-h))]">
            <div className="max-w-[1600px] mx-auto sm:h-full">
                <div className="
          grid grid-cols-1 gap-2 items-start
          sm:gap-3 sm:h-full sm:items-stretch
          sm:grid-cols-[minmax(0,1fr)_clamp(200px,28vw,260px)]
          lg:grid-cols-[minmax(0,1fr)_18px_clamp(260px,22vw,320px)]
        ">
                    <div className="flex flex-col gap-2 sm:h-full sm:min-h-0">
                        <Skeleton className="w-full aspect-square sm:aspect-auto sm:flex-1" />
                        <Skeleton className="h-3.5 lg:hidden" />
                    </div>
                    <Skeleton className="hidden lg:block w-5 h-full" />
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


// -------- Game ended overlay --------------------------------------------------
interface GameEndViewProps {
    result: string | null;
    WhiteName: string;
    BlackName: string;
    fen: string;
}

function GameEndView({ result, WhiteName, BlackName, fen }: GameEndViewProps) {
    const { t } = useT();
    const boardWrapRef = useRef<HTMLDivElement>(null);
    const [boardWidth, setBoardWidth] = useState(0);

    useEffect(() => {
        const el = boardWrapRef.current;
        if (!el) return;
        const measure = () => setBoardWidth(Math.min(el.clientWidth, 480));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // assign result
    const isDraw = result === "1/2-1/2";
    const whiteWins = result === "1-0";
    const blackWins = result === "0-1";
    const hasResult = isDraw || whiteWins || blackWins;

    // Label after game over
    const resultLabel = isDraw
        ? t("result.draw")
        : whiteWins
            ? t("result.whiteWin")
            : blackWins
                ? t("result.blackWin")
                : t("board.gameEnded");

    const winnerName = isDraw ? null : whiteWins ? WhiteName : BlackName;
    const loserName = isDraw ? null : whiteWins ? BlackName : WhiteName;

    return (
        <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-h))] p-4 sm:p-6">
            <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6 lg:gap-8 w-full max-w-[860px]">

                {/* ── Chessboard (final position) ───────────────────── */}
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

                {/* ── Result panel ──────────────────────────────────── */}
                <div className="flex flex-col gap-5 lg:pt-3 items-center lg:items-start text-center lg:text-left w-full max-w-[320px]">

                    {/* Player names */}
                    <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-full bg-[#f0f0f0] border border-black/15 shrink-0" />
                            {WhiteName}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50">vs</span>
                        <span className="flex items-center gap-1.5">
                            {BlackName}
                            <span className="size-2.5 rounded-full bg-[#1a1a1a] border border-white/10 shrink-0" />
                        </span>
                    </div>

                    {/* Result */}
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

                    {/* Actions */}
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

// -------- Main board content --------------------------------------------------
function BoardContent() {
    const { t } = useT();
    const searchParams = useSearchParams();
    const rawID = searchParams.get("id") ?? "";
    const gameID = rawID ? decodeGameID(rawID) : "";
    const router = useRouter();
    const socket = useSocket();
    const { workerRef, onMessageRef, isReady } = useStockfish();
    const pendingFenRef = useRef<string | null>(null);
    const [cp, setCp] = useState<number | null>(null);
    const [navFen, setNavFen] = useState<string | null>(null);
    const currentFenRef = useRef<string | null>(null);
    const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
    const redirectTimerRef = useRef<number | null>(null);
    // const displayFen = navFen ?? fen;
    const boardWrapRef = useRef<HTMLDivElement | null>(null);
    const [boardWidth, setBoardWidth] = useState(0);

    const clearPhysicalBoardGameID = useGameStore((s) => s.clearPhysicalBoardGameID);

    const {
        fen, pgn, WhiteName, BlackName, lastMove, result, isLoaded, loadError, restart, resign, lastMoveAt, moveTimesMap, status,
        initStatus, missingSquares, extraSquares, wrongPieceSquares, branches, mainPgnBeforeBranch, selectBranch, selectedBranchId,
        // cp
    } = useGame(gameID);

    // console.log("BoardContent selectBranch:", selectBranch);
    const prevFenRef = useRef<string>(fen);

    const [navigationState, setNavigationState] = useState<{
        fen: string | null;
        lastMove: { from: string; to: string } | null;
    }>({ fen: null, lastMove: null });

    const displayFen = navigationState.fen ?? fen;
    const displayLastMove = navigationState.fen ? navigationState.lastMove : lastMove;

    useEffect(() => {
        if (!router || !loadError) return;
        if (loadError === "not-found") {
            setOfflineNotice(t("board.offlineRedirect"));
            if (redirectTimerRef.current) {
                window.clearTimeout(redirectTimerRef.current);
            }
            redirectTimerRef.current = window.setTimeout(() => {
                router.replace("/");
            }, 1500);
        }
    }, [loadError, router, t]);

    useEffect(() => {
        if (!socket || !gameID) return;

        // Ensure UI always uses server FEN as the single source of truth.
        const onEspMove = (rawData: any) => {
            const data = Array.isArray(rawData) && rawData.length === 1 ? rawData[0] : rawData;
            if (!data || data.gameID !== gameID) return;
            // Clear any navigation override so displayFen falls back to the store's fen
            setNavigationState({ fen: null, lastMove: null });
        };

        const onGameDestroyed = (data: any) => {
            if (!data) return;
            const gameIDs = Array.isArray(data.gameIDs) ? data.gameIDs : [];
            if (gameIDs.includes(gameID)) {
                setOfflineNotice(t("board.offlineRedirect"));
                if (redirectTimerRef.current) {
                    window.clearTimeout(redirectTimerRef.current);
                }
                redirectTimerRef.current = window.setTimeout(() => {
                    router.replace("/");
                }, 1500);
            }
        };

        const onBoardOffline = (data: any) => {
            if (!data || !data.boardID) return;
            try {
                const boards = useGameStore.getState().physicalBoards;
                const b = boards.find((x: any) => x.boardID === data.boardID && x.gameID === gameID);
                if (b) {
                    setOfflineNotice(t("board.offlineRedirect"));
                    if (redirectTimerRef.current) window.clearTimeout(redirectTimerRef.current);
                    redirectTimerRef.current = window.setTimeout(() => router.replace('/'), 1500);
                }
            } catch (e) {
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
    }, [socket, gameID, router, t]);

    useEffect(() => {
        onMessageRef.current = (line: string) => {
            const cpMatch = line.match(/score cp (-?\d+)/);
            const isBlackToMove = currentFenRef.current?.split(" ")[1] === "b";

            if (cpMatch) {
                let val = Number(cpMatch[1]);
                if (isBlackToMove) val = -val;
                console.log("cp:", Number(cpMatch[1]));
                setCp(val);
                return;
            }

            const mateMatch = line.match(/score mate (-?\d+)/);
            if (mateMatch) {
                const mate = Number(mateMatch[1]);
                const sideToMoveWins = mate > 0;
                const whiteWins = sideToMoveWins ? !isBlackToMove : isBlackToMove;
                setCp(whiteWins ? 10000 : -10000);
            }
        }
    }, []);

    useEffect(() => {
        if (!displayFen) return;

        currentFenRef.current = displayFen;
        pendingFenRef.current = displayFen;

        const worker = workerRef.current;
        if (!worker || !isReady) return;

        worker.postMessage("stop");
        worker.postMessage(`position fen ${displayFen}`);
        worker.postMessage("go movetime 300");
    }, [displayFen, isReady]);

    useEffect(() => {
        const el = boardWrapRef.current;
        if (!el) return;
        const measure = () => {
            const rect = el.getBoundingClientRect();
            const w = Math.floor(rect.width);
            const h = rect.height > 50
                ? Math.floor(rect.height)
                : Math.floor(window.innerHeight - rect.top - 80);
            const next = Math.max(200, Math.min(w, h) - 4);
            setBoardWidth(next);
        };
        measure();
        requestAnimationFrame(measure);
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        window.addEventListener("resize", measure);
        window.addEventListener("orientationchange", measure);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", measure);
            window.removeEventListener("orientationchange", measure);
        }
    }, [isLoaded]);

    useEffect(() => {
        if (fen !== prevFenRef.current) {
            prevFenRef.current = fen;
            setNavigationState({ fen: null, lastMove: null });
        }
    }, [fen]);

    // const handleNavigate = useCallback((f: string | null) => setNavFen(f), []);
    const handleNavigate = useCallback((fen: string | null, lm: { from: string; to: string } | null) => {
        setNavigationState({ fen: fen, lastMove: lm });
    }, []);

    if (offlineNotice) {
        return (
            <div className="p-6 min-h-[calc(100vh-var(--header-h))] flex flex-col items-center justify-center text-center">
                <div className="rounded-xl border border-border bg-background/80 p-6 shadow-sm">
                    <p className="text-sm text-muted-foreground mb-2">{offlineNotice}</p>
                    <p className="text-xs text-muted-foreground">{t("board.viewHistory")}</p>
                </div>
            </div>
        );
    }

    if (!isLoaded) return <BoardSkeleton />

    if (status === GAME_STATUS.ENDED) {
        return (
            <GameEndView
                result={result}
                WhiteName={WhiteName}
                BlackName={BlackName}
                fen={fen}
            />
        )
    }

    // console.log("=== BoardContent DEBUG ===");
    // console.log("pgn from useGame:", pgn);
    // console.log("mainPgnBeforeBranch:", mainPgnBeforeBranch);
    // console.log("branches:", branches);

    return (
        <div className="flex flex-col sm:h-[calc(100vh-var(--header-h))]">

            <div className="flex-1 min-h-0 p-2 sm:p-3">
                <div className="max-w-[1600px] mx-auto sm:h-full">
                    <div className="grid grid-cols-1 gap-2 items-start 
                     sm:gap-3 sm:h-full sm:items-stretch
                    sm:grid-cols-[minmax(0,1fr)_clamp(200px,28vw,260px)]
                    lg:grid-cols-[minmax(0,1fr)_18px_clamp(260px,22vw,320px)]
                    ">
                        {/* column 1: board + evaluation */}
                        <div className="flex flex-col gap-2 sm:h-full sm:min-h-0">
                            <div
                                ref={boardWrapRef}
                                className="
                                w-full min-w-0 aspect-square flex 
                                items-center justify-center sm:aspect-auto sm:flex-1 sm:min-h-0
                                "
                            >
                                <ChessBoardView
                                    fen={displayFen}
                                    // lastMove={navFen ? null : lastMove}
                                    lastMove={displayLastMove}
                                    boardWidth={boardWidth}
                                    missingSquares={missingSquares}
                                    extraSquares={extraSquares}
                                    wrongPieceSquares={wrongPieceSquares}
                                />
                            </div>

                            {/* return ( */}
                            <div className="lg:hidden flex items-center gap-2">
                                <div className="flex-1 min-w-0">
                                    <EvalBar cp={cp} fen={displayFen} orientation="horizontal" />
                                </div>
                            </div>
                            {/* ); */}
                        </div>

                        {/* ── Vertical eval bar — lg+ only ──────────────────── */}
                        <div className="hidden lg:flex lg:items-center lg:h-full">
                            <EvalBar cp={cp} fen={displayFen}/>
                        </div>

                        {/* ----Game panel ------------------------- */}
                        <div className="sm:h-full sm:min-h-0">
                            <GamePanel
                                gameID={gameID}
                                WhiteName={WhiteName}
                                BlackName={BlackName}
                                pgn={pgn}
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
                            />
                        </div>

                    </div>
                </div>
            </div>
        </div>
    )
}

export default function BoardPage() {
    return (
        <Suspense fallback={<BoardSkeleton />}>
            <BoardContent />
        </Suspense>
    )
    // return <BoardContent />;
}
