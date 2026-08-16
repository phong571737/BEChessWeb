"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { formatPickerLabel, pickerGameMap, type PickerGame } from "@/lib/board-picker-games";

export type BoardLayoutMode = 1 | 2 | 4;

function LayoutIcon({ mode, active }: { mode: BoardLayoutMode; active: boolean }) {
    const stroke = "currentColor";
    const fill = active ? "currentColor" : "transparent";
    const opacity = active ? 1 : 0.55;

    if (mode === 1) {
        return (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden style={{ opacity }}>
                <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke={stroke} strokeWidth="1.4" fill={fill} fillOpacity={active ? 0.15 : 0} />
            </svg>
        );
    }
    if (mode === 2) {
        return (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden style={{ opacity }}>
                <rect x="1.5" y="2.5" width="5.5" height="11" rx="1" stroke={stroke} strokeWidth="1.4" fill={fill} fillOpacity={active ? 0.15 : 0} />
                <rect x="9" y="2.5" width="5.5" height="11" rx="1" stroke={stroke} strokeWidth="1.4" fill={fill} fillOpacity={active ? 0.15 : 0} />
            </svg>
        );
    }
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden style={{ opacity }}>
            <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" stroke={stroke} strokeWidth="1.4" fill={fill} fillOpacity={active ? 0.15 : 0} />
            <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" stroke={stroke} strokeWidth="1.4" fill={fill} fillOpacity={active ? 0.15 : 0} />
            <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" stroke={stroke} strokeWidth="1.4" fill={fill} fillOpacity={active ? 0.15 : 0} />
            <rect x="9" y="9" width="5.5" height="5.5" rx="1" stroke={stroke} strokeWidth="1.4" fill={fill} fillOpacity={active ? 0.15 : 0} />
        </svg>
    );
}

interface SlotSelectProps {
    label: string;
    value: string;
    options: PickerGame[];
    gameLookup: Map<string, PickerGame>;
    occupiedElsewhere: string[];
    onChange: (gameID: string) => void;
}

function SlotSelect({ label, value, options, gameLookup, occupiedElsewhere, onChange }: SlotSelectProps) {
    const { t } = useT();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const selected = gameLookup.get(value) ?? options.find((g) => g.gameID === value);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <p className="text-[10px] font-medium text-muted-foreground mb-1">{label}</p>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={cn(
                    "w-full flex items-center justify-between gap-2 rounded-sm border border-border",
                    "bg-background px-2.5 py-1.5 text-xs hover:bg-foreground/[0.03] transition-colors"
                )}
            >
                <span className="truncate font-medium text-foreground">
                    {formatPickerLabel(selected, value)}
                </span>
                <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>
            {open && (
                <div className="absolute left-0 right-0 top-full z-[60] mt-1 rounded-sm border border-border bg-popover shadow-md py-1 max-h-44 overflow-y-auto">
                    {options.map((g) => {
                        const taken = occupiedElsewhere.includes(g.gameID);
                        const isCurrent = g.gameID === value;
                        return (
                            <button
                                key={g.gameID}
                                type="button"
                                disabled={taken && !isCurrent}
                                onClick={() => {
                                    onChange(g.gameID);
                                    setOpen(false);
                                }}
                                className={cn(
                                    "w-full text-left px-2.5 py-2 text-xs transition-colors",
                                    isCurrent && "bg-foreground/[0.06] font-medium",
                                    taken && !isCurrent
                                        ? "text-muted-foreground/40 cursor-not-allowed"
                                        : "hover:bg-foreground/[0.04] text-foreground"
                                )}
                            >
                                {formatPickerLabel(g)}
                            </button>
                        );
                    })}
                    {options.length === 0 && (
                        <p className="px-2.5 py-2 text-xs text-muted-foreground">{t("board.noOtherGames")}</p>
                    )}
                </div>
            )}
        </div>
    );
}

interface Props {
    layout: BoardLayoutMode;
    games: PickerGame[];
    slotIds: string[];
    onLayoutChange: (layout: BoardLayoutMode) => void;
    onSlotsApply: (slotIds: string[], layout: BoardLayoutMode) => void;
    className?: string;
}

export function BoardLayoutSwitcher({
    layout,
    games,
    slotIds,
    onLayoutChange,
    onSlotsApply,
    className,
}: Props) {
    const { t } = useT();
    const rootRef = useRef<HTMLDivElement>(null);
    const enteredFullscreenRef = useRef(false);
    const [openPanel, setOpenPanel] = useState<BoardLayoutMode | null>(null);
    const [draft, setDraft] = useState<string[]>([]);
    const [orientationWarning, setOrientationWarning] = useState(false);

    const pickerGames = useMemo(() => games.slice(0, 3), [games]);
    const gameLookup = useMemo(() => pickerGameMap(pickerGames), [pickerGames]);

    const slotLabels = useMemo(() => {
        if (layout === 1) return [];
        const count = layout === 2 ? 2 : 4;
        return Array.from({ length: count }, (_, i) =>
            formatPickerLabel(gameLookup.get(slotIds[i] ?? ""), slotIds[i])
        );
    }, [layout, slotIds, gameLookup]);

    useEffect(() => {
        if (!openPanel) return;
        const onDoc = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpenPanel(null);
            }
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [openPanel]);

    /**
     * Mobile browsers only allow an orientation lock during a direct user
     * gesture and commonly require fullscreen first. Keep this call in the
     * layout button handler instead of delaying it to a page effect.
     */
    const requestMobileLandscape = useCallback(async () => {
        if (typeof window === "undefined" || !window.matchMedia("(max-width: 1023px)").matches) {
            return;
        }

        setOrientationWarning(false);
        try {
            if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
                enteredFullscreenRef.current = true;
            }

            const orientation = window.screen.orientation;
            if (typeof orientation?.lock !== "function") {
                setOrientationWarning(true);
                return;
            }
            await orientation.lock("landscape");
        } catch {
            setOrientationWarning(true);
        }
    }, []);

    /** Release an orientation/fullscreen session created by this switcher. */
    const releaseMobileLandscape = useCallback(() => {
        if (typeof window === "undefined") return;
        try {
            window.screen.orientation?.unlock?.();
        } catch {
            // Some browsers expose the API but reject unlock outside a PWA.
        }
        if (enteredFullscreenRef.current && document.fullscreenElement && document.exitFullscreen) {
            void document.exitFullscreen().catch(() => undefined);
        }
        enteredFullscreenRef.current = false;
        setOrientationWarning(false);
    }, []);

    const openPicker = useCallback(
        (mode: 2 | 4) => {
            void requestMobileLandscape();
            const count = mode === 2 ? 2 : 4;
            const initial = [...slotIds];
            while (initial.length < count) {
                const next = pickerGames.find((g) => !initial.includes(g.gameID));
                if (!next) break;
                initial.push(next.gameID);
            }
            setDraft(initial.slice(0, count));
            setOpenPanel(mode);
            if (layout !== mode) onLayoutChange(mode);
        },
        [slotIds, pickerGames, layout, onLayoutChange, requestMobileLandscape]
    );

    const applyDraft = useCallback(
        (mode: 2 | 4) => {
            const filled = draft.filter(Boolean);
            if (filled.length >= 1) {
                onSlotsApply(draft.slice(0, mode === 2 ? 2 : 4), mode);
            }
            setOpenPanel(null);
        },
        [draft, onSlotsApply]
    );

    const handleDraftChange = (index: number, gameID: string) => {
        setDraft((prev) => {
            const next = [...prev];
            const otherIdx = next.findIndex((id, i) => i !== index && id === gameID);
            if (otherIdx >= 0) {
                next[otherIdx] = next[index];
            }
            next[index] = gameID;
            return next;
        });
    };

    const canUse2 = pickerGames.length >= 2;
    const canUse4 = pickerGames.length >= 3;

    return (
        <div ref={rootRef} className={cn("relative flex flex-col items-end gap-0.5", className)}>
            {layout > 1 && slotLabels.some((l) => l !== "—") && (
                <div className="hidden lg:flex items-center gap-1 max-w-[320px] justify-end">
                    {slotLabels.map((label, i) => (
                        <span key={i} className="flex items-center gap-1 min-w-0">
                            {i > 0 && <span className="text-muted-foreground/50 text-[10px]">·</span>}
                            <span
                                className="text-[10px] font-medium text-foreground/80 truncate max-w-[140px]"
                                title={label}
                            >
                                {label}
                            </span>
                        </span>
                    ))}
                </div>
            )}

            <div
                className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5"
                role="group"
                aria-label={t("settings.boardLayout")}
            >
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title={t("board.layout1")}
                    aria-label={t("board.layout1")}
                    aria-pressed={layout === 1}
                    className={cn(
                        "size-8 rounded-sm",
                        layout === 1 && "bg-foreground/[0.08] text-foreground",
                        layout !== 1 && "text-muted-foreground"
                    )}
                    onClick={() => {
                        setOpenPanel(null);
                        releaseMobileLandscape();
                        onLayoutChange(1);
                    }}
                >
                    <LayoutIcon mode={1} active={layout === 1} />
                </Button>

                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={!canUse2}
                    title={canUse2 ? t("board.layout2") : t("board.layoutNeedMore")}
                    aria-label={t("board.layout2")}
                    aria-pressed={layout === 2}
                    aria-expanded={openPanel === 2}
                    className={cn(
                        "size-8 rounded-sm",
                        layout === 2 && "bg-foreground/[0.08] text-foreground",
                        layout !== 2 && "text-muted-foreground"
                    )}
                    onClick={() => {
                        if (openPanel === 2) setOpenPanel(null);
                        else openPicker(2);
                    }}
                >
                    <LayoutIcon mode={2} active={layout === 2} />
                </Button>

                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={!canUse4}
                    title={canUse4 ? t("board.layout4") : t("board.layoutNeedMore")}
                    aria-label={t("board.layout4")}
                    aria-pressed={layout === 4}
                    aria-expanded={openPanel === 4}
                    className={cn(
                        "size-8 rounded-sm",
                        layout === 4 && "bg-foreground/[0.08] text-foreground",
                        layout !== 4 && "text-muted-foreground"
                    )}
                    onClick={() => {
                        if (openPanel === 4) setOpenPanel(null);
                        else openPicker(4);
                    }}
                >
                    <LayoutIcon mode={4} active={layout === 4} />
                </Button>
            </div>

            {openPanel && (openPanel === 2 || openPanel === 4) && (
                <div className="absolute right-0 top-full z-[60] mt-1 w-[min(300px,calc(100vw-2rem))] rounded-md border border-border bg-popover shadow-lg p-3 space-y-3">
                    <p className="text-xs font-semibold text-foreground">{t("board.pickBoards")}</p>
                    {orientationWarning && (
                        <p className="text-xs text-warning" role="status">
                            {t("board.landscapeUnavailable")}
                        </p>
                    )}
                    {pickerGames.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t("board.noOtherGames")}</p>
                    ) : (
                        Array.from({ length: openPanel === 2 ? 2 : 4 }, (_, i) => (
                            <SlotSelect
                                key={i}
                                label={
                                    openPanel === 2
                                        ? i === 0
                                            ? t("board.slotLeft")
                                            : t("board.slotRight")
                                        : t("common.boardNumber", { n: i + 1 })
                                }
                                value={draft[i] ?? ""}
                                options={pickerGames}
                                gameLookup={gameLookup}
                                occupiedElsewhere={draft.filter((id, j) => j !== i && !!id)}
                                onChange={(id) => handleDraftChange(i, id)}
                            />
                        ))
                    )}
                    <Button
                        type="button"
                        size="sm"
                        className="w-full h-8 text-xs"
                        disabled={pickerGames.length === 0}
                        onClick={() => applyDraft(openPanel)}
                    >
                        {t("board.applyLayout")}
                    </Button>
                </div>
            )}
        </div>
    );
}
