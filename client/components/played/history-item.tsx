"use client";

import { Badge } from "@/components/ui/badge";
import { Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { resultVariant } from "@/lib/game-utils";
import { useT } from "@/lib/i18n";
import type { HistoryGame } from "@/types/game.types";

interface Props {
  game:    HistoryGame;
  index:   number;
  onClick: (game: HistoryGame) => void;
}

const borderColor: Record<string, string> = {
  "1-0":     "border-l-blue-500",
  "0-1":     "border-l-red-500",
  "1/2-1/2": "border-l-muted-foreground/40",
  "*":        "border-l-border",
};

export function HistoryItem({ game, index, onClick }: Props) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={() => onClick(game)}
      className={cn(
        "w-full text-left flex items-center gap-3 px-4 py-3",
        "bg-card border border-border rounded-sm",
        "border-l-[3px]",
        borderColor[game.Result] ?? "border-l-border",
        "hover:bg-accent transition-colors"
      )}
    >
      {/* Index */}
      <span className="text-xs text-muted-foreground w-6 shrink-0 text-right">
        #{index}
      </span>

      {/* Result badge */}
      <Badge variant={resultVariant(game.Result)} className="shrink-0">
        {game.Result === "1-0" ? t("result.whiteWin") : game.Result === "0-1" ? t("result.blackWin") : game.Result === "1/2-1/2" ? t("result.draw") : game.Result}
      </Badge>

      {/* Players */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-medium text-foreground truncate">{game.WhiteName}</span>
          <span className="text-xs text-muted-foreground shrink-0">vs</span>
          <span className="font-medium text-foreground truncate">{game.BlackName}</span>
        </div>
      </div>

      {/* Moves + date */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Hash className="h-3 w-3" />
          {game.totalMoves} {t("played.moves")}
        </span>
        <span className="text-xs text-muted-foreground">{game.Date}</span>
      </div>
    </button>
  );
}
