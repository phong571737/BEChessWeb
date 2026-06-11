"use client"

import { useActiveGames } from "@/hooks/use-active-games";
import { useRouter } from "next/navigation";
import { RefreshCw } from 'lucide-react';
import { cn } from "@/lib/utils";
import { usePhysicalBoards } from "@/hooks/use-physical-boards";
import type { PhysicalBoard } from "@/types/game.types";
import { SOCKET_CONSTANTS } from "@/lib/constants/socket";
import { GAME_STATUS } from "@/lib/constants/game";
import { encodeGameID } from "@/lib/id-utils";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./empty-state";
import { GameCard } from "./game-card";
import { PhysicalBoardCard } from "./physical-board-card";
import { StartGameDialog } from "./start-game-dialog";

export function GameGrid() {
    const router = useRouter();
    const { loading, refresh, activeGames } = useActiveGames();
    const {boards: physicalBoards} = usePhysicalBoards();
    const [selectedBoard, setselectedBoard] = useState<PhysicalBoard | null>(null);
    const { t } = useT();

    // Hide scan-flow games (shown as PhysicalBoardCard) and finished games
    const cardGames = activeGames.filter(
        (g) => g.status !== GAME_STATUS.WAITING
            && g.status !== SOCKET_CONSTANTS.BOARD_SCAN_FAIL
            && g.status !== GAME_STATUS.FINISHED
    );

    const handleBoardClick = (board: PhysicalBoard) => {
        console.log("clicked", board);
        const isLive = board.gameID && board.gameStatus != GAME_STATUS.FINISHED && board.gameStatus != null;
        if (isLive) {
            router.push(`/board?id=${encodeGameID(board.gameID!)}`)
            return;
        } else {
            setselectedBoard(board);
        }
    }

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

                <button type="button" onClick={refresh} disabled={loading} title="Refresh"
                    className="size-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                    <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                </button>
            </div>

            <div className="flex flex-col">
                {/* ------------------ Physical board --------------------------*/}
                {physicalBoards.length > 0 && (
                    <div className="px-4 sm:px-5 py-4 border-b border-border">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                            {t("home.physicalBoards")}
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {physicalBoards.map((b) => (
                                <PhysicalBoardCard key={b.boardID} board={b} onClick={handleBoardClick}/>
                            ))}
                        </div>
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
                    <div className="p-4 sm:p-5 grid gap-3" style={{
                        gridTemplateColumns: "repeat(auto-fill, minmax(clamp(150px, 42vw, 190px), 1fr))"
                    }}>
                        {cardGames.map((game) => (
                            <GameCard key={game.gameID} game={game} />
                        ))}
                    </div>
                )}

            </div>

            <StartGameDialog  
                board={selectedBoard}
                gameID={selectedBoard?.gameID ?? null}
                onClose={() => setselectedBoard(null)}
            />
        </div>

    );
}