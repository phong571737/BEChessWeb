"use client"

import { GAME_STATUS } from "@/lib/constants/game";
import { useT } from "@/lib/i18n";
import { PhysicalBoard } from "@/types/game.types";
import { cn } from "@/lib/utils";
import { Cpu, Loader2 } from "lucide-react";

interface Props {
    board: PhysicalBoard;
    onClick: (board: PhysicalBoard) => void;
}

export function PhysicalBoardCard({board, onClick}: Props) {
    const {t} = useT();
    const {gameID, gameStatus, online} = board;

    const isOffline = !online;
    const isPending = !isOffline && !gameID;
    const isScanFailed = !isOffline && gameStatus === GAME_STATUS.SCAN_FAIL;
    const inGame = !isOffline && !!gameID && gameStatus === GAME_STATUS.ACTIVE;

    const borderCls = isOffline
        ? "border-border/40 opacity-60 cursor-default"
        : isPending
        ? "border-amber-500/30 cursor-not-allowed"
        : inGame
        ? "border-amber-500/30 hover:border-amber-500/50"
        : isScanFailed
        ? "border-red-500/25 hover:border-red-500/40"
        : "border-border hover:border-border/60";

    return (
        <button
            type="button"
            disabled={isOffline || isPending}
            onClick={() => !isOffline && !isPending && onClick(board)}
            className={cn(
                "w-full flex items-center gap-3 rounded-lg border bg-card text-left",
                "px-3.5 py-3 transition-all duration-150",
                !isOffline && !isPending && "hover:shadow-sm hover:-translate-y-px",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                borderCls
            )}
        >
            <div className="items-center justify-center">
                <Cpu className="size-4"/>
            </div>
            {/* Text */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate leading-tight"> {board.boardID}</p>
            </div>
        </button>
    );
}