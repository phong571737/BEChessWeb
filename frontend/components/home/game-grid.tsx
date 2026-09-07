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
import { BulkGameSetupDialog } from "./bulk-game-setup-dialog";
import { useAuth } from "@/components/providers/auth-provider";
import { useSearchParams } from "next/navigation";
import { decodeGameID } from "@/lib/id-utils";
import { Suspense } from "react";

function GameGridContent() {
    const { loading, refresh, activeGames } = useActiveGames();
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
    const gridClassName = homeLayout === 1 ? "grid gap-3" : "grid grid-cols-2 gap-3";

    return (
        <div className="flex flex-col min-h-0">

            {/* ----Page header ---------------------------------- */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border bg-background/60">
                <div>
                    <h1>{t("home.activeGames")}</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {t("home.gamesLive", { n: cardGames.length })}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {isAdmin && <BulkGameSetupDialog activeGames={cardGames} onApplied={refresh} />}
                    <button type="button" onClick={refresh} disabled={loading} title={t("home.refresh")}
                        className="size-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                        <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            <div className="flex flex-col">
                {tournamentName && (
                    <div className="px-4 sm:px-5 py-4 border-b border-border">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                            {t("home.tournament")}
                        </p>
                        <h2 className="text-lg font-semibold text-foreground">{tournamentName}</h2>
                    </div>
                )}

                {/* -----------------Active game grid --------------------------*/}
                {loading ? (
                    <div className="p-4 sm:p-5 grid gap-3" style={{
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
                    <div className={cn("p-4 sm:p-5", gridClassName)} style={homeLayout === 1 ? {
                        gridTemplateColumns: "repeat(auto-fill, minmax(clamp(150px, 42vw, 190px), 1fr))"
                    } : undefined}>
                        {gamesForLayout.map((game) => (
                            <GameCard key={game.gameID} game={game} physicalBoard={physicalBoards.find((board) => board.boardID === game.boardID)} showStatus={isAdmin} />
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
