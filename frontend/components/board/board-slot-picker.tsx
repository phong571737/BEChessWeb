"use client"

import { useT } from "@/lib/i18n";
import { ActiveGame } from "@/types/game.types";
import { cn } from "@/lib/utils";
import { ArrowLeftRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
    games: ActiveGame[];
    /** Game currently in this slot (hidden from list when replacing) */
    currentId?: string | null;
    /** Game IDs already shown in other slots */
    occupiedIds?: string[];
    onSelect: (gameID: string) => void;
    onCancel?: () => void;
    /** fill empty slot vs replace an existing board */
    mode?: "fill" | "replace";
    className?: string;
}

export function BoardSlotPicker({
    games,
    currentId = null,
    occupiedIds = [],
    onSelect,
    onCancel,
    mode = "fill",
    className,
}: Props) {
    const { t } = useT();
    const occupied = new Set(occupiedIds.filter((id) => id && id !== currentId));

    const options = games.filter((g) => g.gameID !== currentId);

    const title = mode === "replace" ? t("board.changeGame") : t("board.selectGame");

    return (
        <div
            className={cn(
                "h-full min-h-[180px] flex flex-col border border-dashed border-border rounded-sm bg-muted/20",
                className
            )}
        >
            <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2">
                {mode === "replace" ? (
                    <ArrowLeftRight className="size-3.5 text-muted-foreground shrink-0" />
                ) : (
                    <Plus className="size-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="text-xs font-medium text-muted-foreground truncate flex-1">
                    {title}
                </span>
                {onCancel && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        onClick={onCancel}
                        title={t("sg.cancel")}
                    >
                        <X className="size-3.5" />
                    </Button>
                )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                {options.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8 px-3">
                        {t("board.noOtherGames")}
                    </p>
                ) : (
                    options.map((g) => {
                        const isSwap = occupied.has(g.gameID);
                        return (
                            <button
                                key={g.gameID}
                                type="button"
                                onClick={() => onSelect(g.gameID)}
                                className={cn(
                                    "w-full text-left rounded-sm border border-border/70 bg-background px-2.5 py-2",
                                    "hover:border-foreground/30 hover:bg-foreground/[0.03] transition-colors"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-xs font-medium truncate">
                                            {g.whiteName}
                                            <span className="text-muted-foreground font-normal mx-1">vs</span>
                                            {g.blackName}
                                        </div>
                                    </div>
                                    {isSwap && (
                                        <span className="shrink-0 text-[10px] text-muted-foreground border border-border rounded px-1 py-0.5">
                                            {t("board.swapSlot")}
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
