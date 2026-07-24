"use client"

import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { decodeGameID, encodeGameID } from "@/lib/id-utils";
import { useActiveGames } from "@/hooks/use-active-games";
import { useMediaQuery } from "@/hooks/use-media-query";
import { BoardViewSlot, BoardSlotSkeleton } from "@/components/board/board-view-slot";
import type { BoardLayoutMode } from "@/components/board/board-layout-switcher";
import { BoardSlotPicker } from "@/components/board/board-slot-picker";
import { cn } from "@/lib/utils";

function parseLayout(raw: string | null): BoardLayoutMode {
    const n = Number(raw);
    if (n === 2 || n === 4) return n;
    return 1;
}

/** Parallel slots: primary + extras, padded with null for empty pickers */
function buildSlots(primary: string, extras: string[], count: number): (string | null)[] {
    const ordered = [primary, ...extras.filter((id) => id && id !== primary)];
    const unique: string[] = [];
    for (const id of ordered) {
        if (!unique.includes(id)) unique.push(id);
    }
    const slots: (string | null)[] = unique.slice(0, count);
    while (slots.length < count) slots.push(null);
    return slots;
}

function BoardContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isDesktop = useMediaQuery("(min-width: 1024px)");
    const { activeGames } = useActiveGames();
    /** Which slot is open for pick / replace */
    const [editingSlot, setEditingSlot] = useState<number | null>(null);

    const primaryRaw = searchParams.get("id") ?? "";
    const primaryID = primaryRaw ? decodeGameID(primaryRaw) : "";

    const extrasRaw = searchParams.get("ids") ?? "";
    const extraIDs = useMemo(
        () =>
            extrasRaw
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((h) => {
                    try {
                        return decodeGameID(h);
                    } catch {
                        return "";
                    }
                })
                .filter(Boolean),
        [extrasRaw]
    );

    const urlLayout = parseLayout(searchParams.get("layout"));
    const effectiveLayout: BoardLayoutMode = isDesktop ? urlLayout : 1;
    const slotCount = effectiveLayout;

    const slots = useMemo(
        () => (primaryID ? buildSlots(primaryID, extraIDs, slotCount) : []),
        [primaryID, extraIDs, slotCount]
    );

    const pushState = useCallback(
        (nextSlots: (string | null)[], nextLayout: BoardLayoutMode) => {
            const filled = nextSlots.filter((id): id is string => !!id);
            if (filled.length === 0) {
                router.replace("/");
                return;
            }
            const [first, ...rest] = filled;
            const params = new URLSearchParams();
            params.set("id", encodeGameID(first));
            if (rest.length > 0) {
                params.set("ids", rest.map(encodeGameID).join(","));
            }
            if (nextLayout !== 1) {
                params.set("layout", String(nextLayout));
            }
            router.replace(`/board?${params.toString()}`, { scroll: false });
        },
        [router]
    );

    /** Assign game to slot; if already shown elsewhere, swap the two slots */
    const handleSelectSlot = useCallback(
        (index: number, gameID: string) => {
            const next = [...slots];
            const otherIndex = next.findIndex((id, i) => i !== index && id === gameID);
            if (otherIndex >= 0) {
                next[otherIndex] = next[index];
                next[index] = gameID;
            } else {
                next[index] = gameID;
            }
            setEditingSlot(null);
            pushState(next, effectiveLayout);
        },
        [slots, effectiveLayout, pushState]
    );

    const handleRemoveSlot = useCallback(
        (index: number) => {
            const next = [...slots];
            next[index] = null;
            const filled = next.filter(Boolean).length;
            let nextLayout = effectiveLayout;
            if (filled <= 1) nextLayout = 1;
            else if (filled <= 2 && effectiveLayout === 4) nextLayout = 2;
            setEditingSlot(null);
            pushState(next, nextLayout);
        },
        [slots, effectiveLayout, pushState]
    );

    const handleUnavailable = useCallback(
        (index: number) => {
            if (effectiveLayout === 1) {
                router.replace("/");
                return;
            }
            handleRemoveSlot(index);
        },
        [effectiveLayout, handleRemoveSlot, router]
    );

    if (!primaryID) {
        return (
            <div className="p-6 text-sm text-muted-foreground text-center">
                Missing game id
            </div>
        );
    }

    const canChange =
        effectiveLayout > 1 && activeGames.length > 1;

    return (
        <div className="flex flex-col h-[calc(100vh-var(--header-h))] min-h-0">
            <div className="flex-1 min-h-0">
                {effectiveLayout === 1 ? (
                    <BoardViewSlot
                        gameID={slots[0]!}
                        enableEval
                        compact={false}
                    />
                ) : (
                    <div
                        className={cn(
                            "h-full min-h-0 p-2 gap-2 grid",
                            effectiveLayout === 2 && "grid-cols-2 grid-rows-1",
                            effectiveLayout === 4 && "grid-cols-2 grid-rows-2"
                        )}
                    >
                        {slots.map((gameID, index) => {
                            const isEditing = editingSlot === index;
                            const showPicker = !gameID || isEditing;

                            return (
                                <div key={`slot-${index}`} className="min-h-0 min-w-0 h-full">
                                    {showPicker ? (
                                        <BoardSlotPicker
                                            games={activeGames}
                                            mode={gameID ? "replace" : "fill"}
                                            currentId={gameID}
                                            occupiedIds={slots.filter(
                                                (id, i): id is string => !!id && i !== index
                                            )}
                                            onSelect={(id) => handleSelectSlot(index, id)}
                                            onCancel={gameID ? () => setEditingSlot(null) : undefined}
                                        />
                                    ) : (
                                        <BoardViewSlot
                                            gameID={gameID}
                                            compact
                                            enableEval={false}
                                            onChangeGame={
                                                canChange ? () => setEditingSlot(index) : undefined
                                            }
                                            onRemove={() => handleRemoveSlot(index)}
                                            onUnavailable={() => handleUnavailable(index)}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function BoardPage() {
    return (
        <Suspense fallback={<BoardSlotSkeleton />}>
            <BoardContent />
        </Suspense>
    );
}
