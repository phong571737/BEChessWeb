"use client"

import { GAME_STATUS } from "@/lib/constants/game";
import { useT } from "@/lib/i18n";
import { PhysicalBoard } from "@/types/game.types";
import { cn } from "@/lib/utils";

interface Props {
    board: PhysicalBoard;
    onClick: (board: PhysicalBoard) => void;
}

export function PhysicalBoardCard({board, onClick}: Props) {
    const {t} = useT();
    const {gameID, gameStatus, online} = board;

    const isOffline = !online;
    const isWaitingScan = !isOffline && gameStatus === GAME_STATUS.WAITING;
    const isScanFailed = !isOffline && gameStatus === GAME_STATUS.SCAN_FAIL;
    const inGame = !isOffline && !gameID && gameStatus === GAME_STATUS.ACTIVE;

    const borderCls = isOffline
        ? "border-border/40 opacity-60 cursor-default"
        : inGame
        ? "border-blue-500/25 hover:border-blue-500/40"
        : isWaitingScan
        ? "border-amber-500/30 hover:border-amber-500/50"
        : isScanFailed
        ? "border-red-500/25 hover:border-red-500/40"
        : "border-border hover:border-border/60";

    return (
        <button
            onClick={() => !isOffline && onClick(board)}
            className={cn(
                "w-full flex items-center gap-3 rounded-lg border bg-card text-left",
                "px-3.5 py-3 transition-all duration-150",
                !isOffline && "hover:shadow-sm hover:-translate-y-px",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                borderCls
            )}
        >

        </button>
    );
}