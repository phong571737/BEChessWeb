"use client"

import { decodeGameID } from "@/lib/id-utils";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { useGame } from "@/hooks/use-game";
import { ChessBoardView } from "@/components/board/chess-board-view";
import { useT } from "@/lib/i18n";
import { GamePanel } from "@/components/board/game-panel";
import { useCallback } from "react";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function BoardSkeleton() {
    return (
        <div className="p-2 sm:p-3 sm:h-[calc(100vh-var(--header-h))]">
            <div className="max-w-[1600px] mx-auto sm:h-full">
                <div className="
                grid grid-cols-1 gap-2 items-start
                ">
                    
                </div>
            </div>
        </div>
    )
}

// ── Main board content ─────────────────────────────────────────────────────────
function BoardContent() {
    const searchParams = useSearchParams();
    const rawID = searchParams.get("id") ?? "";
    const gameID = rawID ? decodeGameID(rawID) : "";

    const clearPhysicalBoardGameID = useGameStore((s) => s.clearPhysicalBoardGameID);

    const {
        fen, pgn, WhiteName, BlackName, lastMove, isLoaded, restart, resign, lastMoveAt, moveTimesMap
    } = useGame(gameID);

    const {t} = useT();
    const [navFen, setNavFen] = useState<string | null>(null);
    const displayFen = navFen ?? fen;
    const boardWrapRef = useRef<HTMLDivElement | null>(null);
    const [boardWidth, setBoardWidth] = useState(0);

    useEffect(() => {
        const el = boardWrapRef.current;
        if (!el) return;
        const measure = () => {
            const rect = el.getBoundingClientRect();
            const w = Math.floor(rect.width);
            const h = rect.height > 50
                ? Math.floor(rect.height)
                : Math.floor(window.innerHeight - rect.top - 80);
            const next = Math.max(200, Math.min(w, h) - 4);
            setBoardWidth(next);
        };
        measure();
        requestAnimationFrame(measure);
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        window.addEventListener("resize", measure);
        window.addEventListener("orientationchange", measure);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", measure);
            window.removeEventListener("orientationchange", measure);
        }
    }, []);

    const handleNavigate = useCallback((f: string | null) => setNavFen(f), []);

    return (
        <div className="flex flex-col sm:h-[calc(100vh-var(--header-h))]">

            <div className="flex-1 min-h-0 p-2 sm:p-3">
                <div className="max-w-[1600px] mx-auto sm:h-full">
                    <div className="grid grid-cols-1 gap-2 items-start 
                     sm:gap-3 sm:h-full sm:items-stretch
                    sm:grid-cols-[minmax(0,1fr)_clamp(200px,28vw,260px)]
                    lg:grid-cols-[minmax(0,1fr)_18px_clamp(260px,22vw,320px)]
                    ">
                        {/* column 1: board + evaluation */}
                        <div className="flex flex-col gap-2 sm:h-full sm:min-h-0">
                            <div 
                                ref={boardWrapRef}
                                className="
                                w-full min-w-0 aspect-square flex 
                                items-center justify-center sm:aspect-auto sm:flex-1 sm:min-h-0
                                "   
                            >
                                <ChessBoardView
                                    fen={displayFen}
                                    lastMove={navFen ? null : lastMove}
                                    boardWidth={boardWidth}
                                />
                            </div>
                        </div>

                        {/* ── Vertical eval bar — lg+ only ──────────────────── */}
                        <div className="hidden lg:flex lg:items-center lg:h-full">
                            {/* <EvalBar cp={cp} /> */}
                        </div>

                        {/* ----Game panel ------------------------- */}
                        <div className="sm:h-full">
                            <GamePanel
                                gameID={gameID}
                                WhiteName={WhiteName}
                                BlackName={BlackName}
                                pgn={pgn}
                                // status={status}
                                lastMoveAt={lastMoveAt}
                                onRestart={restart}
                                onResign={resign}
                                moveTimesMap={moveTimesMap}
                                onNavigate={handleNavigate}
                            />
                        </div>

                    </div>
                </div>
            </div>
        </div>
    )
}

export default function BoardPage() {
    return (
        <Suspense fallback={<BoardSkeleton />}>
            <BoardContent/>
        </Suspense>
    )
}