"use client";

import { Cpu, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { PhysicalBoard } from "@/types/game.types";

interface Props {
  board: PhysicalBoard;
  onClick: (board: PhysicalBoard) => void;
}

export function PhysicalBoardCard({ board, onClick }: Props) {
  const { t } = useT();
  const { gameID, gameStatus, online } = board;

  const isOffline     = !online;
  const isWaitingScan = !isOffline && gameStatus === "waiting_scan";
  const isScanFailed  = !isOffline && gameStatus === "scan_failed";
  const inGame        = !isOffline && !!gameID && gameStatus === "active";
  // "finished" → treat as ready (game ended, board free for a new game)

  const borderCls = isOffline
    ? "border-border/40 opacity-60 cursor-default"
    : inGame
    ? "border-blue-500/25 hover:border-blue-500/40"
    : isWaitingScan
    ? "border-amber-500/30 hover:border-amber-500/50"
    : isScanFailed
    ? "border-red-500/25 hover:border-red-500/40"
    : "border-border hover:border-border/60";

  const iconBg = isOffline
    ? "bg-muted/60 text-muted-foreground/50"
    : inGame
    ? "bg-blue-500/10 text-blue-500"
    : isWaitingScan
    ? "bg-amber-500/10 text-amber-500"
    : isScanFailed
    ? "bg-red-500/10 text-red-500"
    : "bg-green-500/10 text-green-500";

  const statusText = isOffline
    ? t("home.offline")
    : inGame
    ? t("home.playing")
    : isWaitingScan
    ? t("home.waitingScan")
    : isScanFailed
    ? t("home.scanFailed")
    : t("home.ready");

  const statusColor = isOffline
    ? "text-muted-foreground/50"
    : inGame
    ? "text-blue-500"
    : isWaitingScan
    ? "text-amber-500"
    : isScanFailed
    ? "text-red-500"
    : "text-green-500";

  const dotCls = isOffline
    ? "bg-muted-foreground/30"
    : inGame
    ? "bg-blue-500 shadow-[0_0_6px_1px_rgba(59,130,246,0.5)]"
    : isWaitingScan
    ? "bg-amber-400 shadow-[0_0_6px_1px_rgba(251,191,36,0.5)]"
    : isScanFailed
    ? "bg-red-500 shadow-[0_0_6px_1px_rgba(239,68,68,0.5)]"
    : "bg-green-500 shadow-[0_0_6px_1px_rgba(34,197,94,0.5)] animate-pulse";

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
      {/* Icon */}
      <div className={cn("size-9 rounded-md flex items-center justify-center shrink-0", iconBg)}>
        {isWaitingScan ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Cpu className="size-4" />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate leading-tight">{board.boardID}</p>
        <p className={cn("text-xs mt-0.5 leading-tight", statusColor)}>{statusText}</p>
      </div>

      {/* Status dot */}
      <span className={cn("size-2 rounded-full shrink-0", dotCls)} />
    </button>
  );
}
