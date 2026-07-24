"use client"

import { Suspense, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BoardLayoutSwitcher, type BoardLayoutMode } from "@/components/board/board-layout-switcher";
import { useActiveGames } from "@/hooks/use-active-games";
import { usePhysicalBoards } from "@/hooks/use-physical-boards";
import { decodeGameID, encodeGameID } from "@/lib/id-utils";
import { useGameStore } from "@/lib/store";
import { buildPickerGames } from "@/lib/board-picker-games";

function parseLayout(raw: string | null): BoardLayoutMode {
    const n = Number(raw);
    if (n === 2 || n === 4) return n;
    return 1;
}

function buildSlotIds(primary: string, extras: string[], count: number): string[] {
    const ordered = [primary, ...extras.filter((id) => id && id !== primary)];
    const unique: string[] = [];
    for (const id of ordered) {
        if (!unique.includes(id)) unique.push(id);
    }
    return unique.slice(0, count);
}

function fillDefaults(pickerIds: string[], primary: string, extras: string[], count: number): string[] {
    const ordered = [
        primary,
        ...extras.filter((id) => id && id !== primary),
        ...pickerIds.filter((id) => id && id !== primary),
    ];
    const unique: string[] = [];
    for (const id of ordered) {
        if (!unique.includes(id)) unique.push(id);
        if (unique.length >= count) break;
    }
    return unique;
}

function pushBoardUrl(
    router: ReturnType<typeof useRouter>,
    slotIds: string[],
    layout: BoardLayoutMode
) {
    const filled = slotIds.filter(Boolean);
    if (filled.length === 0) return;
    const [first, ...rest] = filled;
    const params = new URLSearchParams();
    params.set("id", encodeGameID(first));
    if (rest.length > 0) {
        params.set("ids", rest.map(encodeGameID).join(","));
    }
    if (layout !== 1) {
        params.set("layout", String(layout));
    }
    router.replace(`/board?${params.toString()}`, { scroll: false });
}

function BoardLayoutHeaderInner() {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { activeGames } = useActiveGames();
    const { boards: physicalBoards } = usePhysicalBoards();
    const boards = useGameStore((s) => s.boards);

    const onBoard = pathname === "/board" || pathname.startsWith("/board/");
    const primaryRaw = searchParams.get("id") ?? "";
    const primaryID = useMemo(() => {
        if (!primaryRaw) return "";
        try {
            return decodeGameID(primaryRaw);
        } catch {
            return "";
        }
    }, [primaryRaw]);

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

    const layout = parseLayout(searchParams.get("layout"));

    const slotIds = useMemo(() => {
        if (layout === 1) return primaryID ? [primaryID] : [];
        return buildSlotIds(primaryID, extraIDs, layout);
    }, [layout, primaryID, extraIDs]);

    const pickerGames = useMemo(
        () => buildPickerGames(activeGames, boards, physicalBoards, slotIds),
        [activeGames, boards, physicalBoards, slotIds]
    );

    const pickerIds = useMemo(() => pickerGames.map((g) => g.gameID), [pickerGames]);

    const handleLayoutChange = useCallback(
        (next: BoardLayoutMode) => {
            if (!primaryID) return;
            if (next === 1) {
                pushBoardUrl(router, [primaryID], 1);
                return;
            }
            const filled = fillDefaults(pickerIds, primaryID, extraIDs, next);
            pushBoardUrl(router, filled, next);
        },
        [primaryID, extraIDs, pickerIds, router]
    );

    const handleSlotsApply = useCallback(
        (ids: string[], nextLayout: BoardLayoutMode) => {
            pushBoardUrl(router, ids, nextLayout);
        },
        [router]
    );

    if (!onBoard || !primaryID) return null;

    return (
        <BoardLayoutSwitcher
            layout={layout}
            games={pickerGames}
            slotIds={slotIds}
            onLayoutChange={handleLayoutChange}
            onSlotsApply={handleSlotsApply}
            className="hidden lg:flex mr-1"
        />
    );
}

/** Layout icons in the app header (left of language). Laptop only. */
export function BoardLayoutHeaderControl() {
    return (
        <Suspense fallback={null}>
            <BoardLayoutHeaderInner />
        </Suspense>
    );
}
