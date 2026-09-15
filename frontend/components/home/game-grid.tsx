"use client"

import { useActiveGames } from "@/hooks/use-active-games";
import { ChevronLeft, ChevronRight, ListOrdered, RefreshCw } from 'lucide-react';
import { cn } from "@/lib/utils";
import { usePhysicalBoards } from "@/hooks/use-physical-boards";
import { SOCKET_CONSTANTS } from "@/lib/constants/socket";
import { GAME_STATUS } from "@/lib/constants/game";
import { useT } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./empty-state";
import { GameCard } from "./game-card";
import { BoardViewSlot } from "@/components/board/board-view-slot";
import { BulkGameSetupDialog } from "./bulk-game-setup-dialog";
import { useAuth } from "@/components/providers/auth-provider";
import { useSearchParams } from "next/navigation";
import { decodeGameID } from "@/lib/id-utils";
import { Suspense, useMemo, useState } from "react";
import { useBoardDisplay } from "@/components/providers/board-display-provider";

function homeBoardKey(game: { boardID?: string; gameID: string }): string {
    return game.boardID?.trim() || game.gameID;
}

function GameGridContent() {
    const { loading, refresh, refreshSilently, activeGames } = useActiveGames();
    const {boards: physicalBoards} = usePhysicalBoards();
    const { t } = useT();
    const { isAdmin } = useAuth();
    const { homeBoardOrder, setHomeBoardOrder } = useBoardDisplay();
    const [arrangingBoards, setArrangingBoards] = useState(false);
    const searchParams = useSearchParams();

    // Keep a restarted game visible while its physical board is being initialized.
    // This preserves the mini chessboard card and lets the user reopen its session.
    const cardGames = activeGames.filter(
        (g) => g.status !== SOCKET_CONSTANTS.BOARD_SCAN_FAIL
            && g.status !== GAME_STATUS.FINISHED
    );
    const orderedCardGames = useMemo(() => {
        const positions = new Map(homeBoardOrder.map((key, index) => [key, index]));
        return cardGames
            .map((game, originalIndex) => ({ game, originalIndex }))
            .sort((left, right) => {
                const leftPosition = positions.get(homeBoardKey(left.game));
                const rightPosition = positions.get(homeBoardKey(right.game));
                if (leftPosition !== undefined || rightPosition !== undefined) {
                    return (leftPosition ?? Number.MAX_SAFE_INTEGER) - (rightPosition ?? Number.MAX_SAFE_INTEGER)
                        || left.originalIndex - right.originalIndex;
                }
                return left.originalIndex - right.originalIndex;
            })
            .map(({ game }) => game);
    }, [cardGames, homeBoardOrder]);

    const moveBoard = (gameID: string, direction: -1 | 1) => {
        const currentIndex = orderedCardGames.findIndex((game) => game.gameID === gameID);
        const targetIndex = currentIndex + direction;
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedCardGames.length) return;

        const visibleKeys = orderedCardGames.map(homeBoardKey);
        const completeOrder = Array.from(new Set([...homeBoardOrder, ...visibleKeys]));
        const currentKey = visibleKeys[currentIndex];
        const targetKey = visibleKeys[targetIndex];
        const currentOrderIndex = completeOrder.indexOf(currentKey);
        const targetOrderIndex = completeOrder.indexOf(targetKey);
        [completeOrder[currentOrderIndex], completeOrder[targetOrderIndex]] = [
            completeOrder[targetOrderIndex],
            completeOrder[currentOrderIndex],
        ];
        setHomeBoardOrder(completeOrder);
    };

    const tournamentName = orderedCardGames.find((game) => game.tournament?.trim())?.tournament?.trim();
    const requestedLayout = Number(searchParams.get("homeLayout"));
    const homeLayout = requestedLayout === 2 || requestedLayout === 4 ? requestedLayout : 1;
    const homeSlotIds = searchParams.get("homeIds")?.split(",").map((value) => {
        try {
            return decodeGameID(value.trim());
        } catch {
            return "";
        }
    }).filter(Boolean) ?? [];
    const displayedGames = homeLayout === 1
        ? orderedCardGames
        : homeSlotIds.map((gameID) => orderedCardGames.find((game) => game.gameID === gameID)).filter((game): game is typeof orderedCardGames[number] => Boolean(game));
    const gamesForLayout = displayedGames.length > 0 ? displayedGames : orderedCardGames.slice(0, homeLayout);
    const gridClassName = homeLayout === 1 ? "grid gap-3" : "grid grid-cols-2 gap-1 lg:gap-3";
    const twoBoardView = homeLayout === 2;

    return (
        <div className={cn("flex flex-col min-h-0", twoBoardView && "h-[calc(100vh-var(--header-h))]")}>

            {homeLayout === 1 && (
                <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border bg-background/60">
                    <div className={cn("active-games-heading", isAdmin && "active-games-heading-admin", !isAdmin && "active-games-heading-user")}>
                        <h1 className="text-sm sm:text-base">
                            {t("home.activeGames")}
                        </h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {t("home.gamesLive", { n: cardGames.length })}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {isAdmin && <BulkGameSetupDialog activeGames={orderedCardGames} onApplied={refreshSilently} />}
                        {isAdmin && (
                            <button
                                type="button"
                                onClick={() => setArrangingBoards((value) => !value)}
                                aria-pressed={arrangingBoards}
                                title={arrangingBoards ? t("settings.done") : t("home.arrangeBoards")}
                                className={cn("flex size-8 items-center justify-center rounded-md border border-border text-xs font-medium transition-colors hover:bg-accent sm:w-auto sm:gap-1.5 sm:px-2.5", arrangingBoards && "bg-accent text-foreground")}
                            >
                                <ListOrdered className="size-3.5" />
                                <span className="hidden sm:inline">{arrangingBoards ? t("settings.done") : t("home.arrangeBoards")}</span>
                            </button>
                        )}
                        <button type="button" onClick={refresh} disabled={loading} title={t("home.refresh")}
                            className="hidden size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex">
                            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                        </button>
                    </div>
                </div>
            )}

            <div className={cn("flex flex-col", twoBoardView && "min-h-0 flex-1")}>
                {tournamentName && (
                    <div className="border-b border-border px-1 py-1 lg:px-5 lg:py-4">
                        <p className="hidden text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3 lg:block">
                            {t("home.tournament")}
                        </p>
                        <h2 className="text-center text-sm font-semibold text-foreground lg:text-left lg:text-lg">{tournamentName}</h2>
                    </div>
                )}

                {/* -----------------Active game grid --------------------------*/}
                {loading ? (
                    <div className={cn("grid gap-3", twoBoardView ? "p-1 lg:p-5" : "p-4 sm:p-5")} style={{
                        gridTemplateColumns: "repeat(auto-fill, minmax(clamp(150px, 42vw, 190px), 1fr))"
                    }}>
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="rounded-lg border border-border bg-card overflow-hidden">
                                
                                <Skeleton className="w-full aspect-square rounded-none" />
                                <div className="px-3 py-2.5 flex items-center gap-2">
                                    <Skeleton className="h-3 flex-1" />
                                    <Skeleton className="h-3 w-5" />
                                    <Skeleton className="h-3 flex-1" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : cardGames.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className={cn(
                        gridClassName,
                        twoBoardView ? "min-h-0 flex-1 p-1 lg:p-5" : "p-4 sm:p-5"
                    )} style={homeLayout === 1 ? {
                        gridTemplateColumns: "repeat(auto-fill, minmax(clamp(150px, 42vw, 190px), 1fr))"
                    } : undefined}>
                        {gamesForLayout.map((game, gameIndex) => (
                            twoBoardView ? (
                                <BoardViewSlot
                                    key={game.gameID}
                                    gameID={game.gameID}
                                    compact
                                    enableEval
                                    twoBoardLayout
                                />
                            ) : (
                                <div key={game.gameID} className="relative min-w-0">
                                    {isAdmin && arrangingBoards && (
                                        <div className="absolute right-1 top-1 z-20 flex items-center gap-1 rounded-md border border-border bg-background/95 p-0.5 shadow-sm">
                                            <button type="button" disabled={gameIndex === 0} onClick={() => moveBoard(game.gameID, -1)} title={t("home.moveBoardEarlier")} aria-label={t("home.moveBoardEarlier")} className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30">
                                                <ChevronLeft className="size-3.5" />
                                            </button>
                                            <button type="button" disabled={gameIndex === gamesForLayout.length - 1} onClick={() => moveBoard(game.gameID, 1)} title={t("home.moveBoardLater")} aria-label={t("home.moveBoardLater")} className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30">
                                                <ChevronRight className="size-3.5" />
                                            </button>
                                        </div>
                                    )}
                                    <GameCard game={game} physicalBoard={physicalBoards.find((board) => board.boardID === game.boardID)} showStatus={isAdmin} isAdmin={isAdmin} />
                                </div>
                            )
                        ))}
                    </div>
                )}

            </div>
        </div>

    );
}

export function GameGrid() {
    return (
        <Suspense fallback={<div className="min-h-24" />}>
            <GameGridContent />
        </Suspense>
    );
}
