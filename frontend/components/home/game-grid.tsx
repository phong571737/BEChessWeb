"use client"

import { useActiveGames } from "@/hooks/use-active-games";
import { RefreshCw } from 'lucide-react';
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
import { Suspense } from "react";

function GameGridContent() {
    const { loading, refresh, refreshSilently, activeGames } = useActiveGames();
    const {boards: physicalBoards} = usePhysicalBoards();
    const { t } = useT();
    const { isAdmin } = useAuth();
    const searchParams = useSearchParams();

    // Keep a restarted game visible while its physical board is being initialized.
    // This preserves the mini chessboard card and lets the user reopen its session.
    const cardGames = activeGames.filter(
        (g) => g.status !== SOCKET_CONSTANTS.BOARD_SCAN_FAIL
            && g.status !== GAME_STATUS.FINISHED
    );

    const tournamentName = cardGames.find((game) => game.tournament?.trim())?.tournament?.trim();
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
        ? cardGames
        : homeSlotIds.map((gameID) => cardGames.find((game) => game.gameID === gameID)).filter((game): game is typeof cardGames[number] => Boolean(game));
    const gamesForLayout = displayedGames.length > 0 ? displayedGames : cardGames.slice(0, homeLayout);
    const gridClassName = homeLayout === 1 ? "grid gap-3" : "grid grid-cols-2 gap-1 lg:gap-3";
    const twoBoardView = homeLayout === 2;

    return (
        <div className={cn("flex flex-col min-h-0", twoBoardView && "h-[calc(100vh-var(--header-h))]")}>

            {homeLayout === 1 && (
                <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border bg-background/60">
                    <div>
                        <h1 className="text-sm sm:text-base">{t("home.activeGames")}</h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {t("home.gamesLive", { n: cardGames.length })}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {isAdmin && <BulkGameSetupDialog activeGames={cardGames} onApplied={refreshSilently} />}
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
                        {gamesForLayout.map((game) => (
                            twoBoardView ? (
                                <BoardViewSlot
                                    key={game.gameID}
                                    gameID={game.gameID}
                                    compact
                                    enableEval
                                    twoBoardLayout
                                />
                            ) : (
                                <GameCard key={game.gameID} game={game} physicalBoard={physicalBoards.find((board) => board.boardID === game.boardID)} showStatus={isAdmin} isAdmin={isAdmin} />
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
