"use client"

import { GAME_STATUS } from "@/lib/constants/game";
import { useT } from "@/lib/i18n";
import { Chess } from "chess.js";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { PGNTable } from "./pgn-table";
import { Button } from "@/components/ui/button";
import { ChevronsLeft, ChevronRight, ChevronLeft, ChevronsRight } from "lucide-react";
import { GameActions } from "./game-actions";
import { Branch } from "@/types/game.types";
import type { ClockSide } from "@/hooks/use-chess-clock";
import { formatClockMs } from "@/hooks/use-chess-clock";

interface Props {
    gameID: string;
    WhiteName: string;
    BlackName: string;
    fen: string;
    pgn: string;
    // boardConnected: boolean;
    status: string;
    /** Timestamp of the last move — drives the live thinking clock */
    lastMoveAt: number;
    /** 0-based ply → elapsed ms (only live moves have an entry) */
    moveTimesMap: Record<number, number>;
    onRestart: () => Promise<void>;
    onResign: (resignSide: "white" | "black" | "draw") => Promise<void>;
    onNavigate: (fen: string | null, lastMove: {from: string; to: string} | null) => void;
    branches?: Branch[];
    mainPgnBeforeBranch?: string;
    selectedBranchId: string | null;
    onBranchSelect: (branchId: string | null) => void;
    /** Chess clock — displayed inline next to player name */
    whiteClockMs?: number;
    blackClockMs?: number;
    activeClockSide?: ClockSide;
    isAdmin?: boolean;
}

export interface GamePanelHandle {
    goBack: () => void;
    goNext: () => void;
    goStart: () => void;
    goEnd: () => void;
}

export const GamePanel = forwardRef<GamePanelHandle, Props>(function GamePanel({
    gameID, WhiteName, BlackName, fen, pgn, lastMoveAt, moveTimesMap, onRestart, onResign, onNavigate, status,
    branches = [], mainPgnBeforeBranch = "", onBranchSelect, selectedBranchId,
    whiteClockMs, blackClockMs, activeClockSide, isAdmin = false,
}, ref) {
    const { t } = useT();
    const [cursor, setCursor] = useState(-1);

    // Determine the current branch
    const currentBranch = useMemo(() => {
        return branches.find(b => b.id === selectedBranchId) || null;
    }, [branches, selectedBranchId]);

    const activePGN = currentBranch ? currentBranch.pgn : pgn;
    const [copied, setCopied] = useState(false);
    const [notationMode, setNotationMove] = useState<"pgn" | "fen">("pgn");

    const hasBranches = branches.length > 0;

    // Build FEN history from the active PGN view shown on the board
    const {fenHistory, moveHistory} = useMemo(() => {
        if (!activePGN?.trim()) return { fenHistory: [], moveHistory: [] };
        try {
            const c = new Chess();
            const tmp = new Chess();
            c.loadPgn(activePGN);
            const hist = c.history({verbose: true});

            const fens: string[] = ["start"];
            const moves: (any | null)[] = [null];

            for (const m of hist) {
                tmp.move(m);
                fens.push(tmp.fen());
                moves.push({ from: m.from, to: m.to });
            }
            return { fenHistory: fens, moveHistory: moves };
        } catch {
            return { fenHistory: [], moveHistory: [] };
        }
    }, [activePGN]);

    const totalMoves = Math.max(0, fenHistory.length - 1);
    const activeCursor = cursor === -1 ? totalMoves : cursor;

    // Determine whose turn it is from the FEN string (the single source of truth).
    // FEN format: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
    // The 2nd field is "w" for White's turn or "b" for Black's turn.
    // "start" means initial position → White's turn.
    const isWhiteTurn = useMemo(() => {
        const activeFen = fen === "start" ? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" : fen;
        return activeFen.split(" ")[1] === "w";
    }, [fen]);
    // const isPlaying = status === GAME_STATUS.PLAYING;

    // Reset cursor
    useEffect(() => {
        if (!hasBranches) {
            setCursor(-1);
            onNavigate(null, null);
        }
    }, [hasBranches]);

    const goTo = useCallback((idx: number) => {
        const clamped = Math.max(0, Math.min(totalMoves, idx));
        setCursor(clamped === totalMoves ? -1 : clamped);

        const targetFen = clamped === totalMoves && !selectedBranchId ? null : (fenHistory[clamped] ?? "start");
        const targetMove = moveHistory[clamped] ?? null;

        // onNavigate(clamped === totalMoves ? null : fenHistory[clamped] ?? "start");
        onNavigate(targetFen, targetMove);
    }, [fenHistory, totalMoves, onNavigate]);

    const goStart = useCallback(() => goTo(0), [goTo]);
    const goBack = useCallback(() => goTo(activeCursor - 1), [goTo, activeCursor]);
    const goNext = useCallback(() => goTo(activeCursor + 1), [goTo, activeCursor]);
    const goEnd = useCallback(() => goTo(totalMoves), [totalMoves]);

    // Expose navigation to parent
    useImperativeHandle(ref, () => ({ goBack, goNext, goStart, goEnd }), [goBack, goNext, goStart, goEnd]);

    // Keyboard navigation prev, next, home, end
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
            if ((e.target as HTMLElement)?.isContentEditable) return;
            if (e.key === "ArrowLeft")  { e.preventDefault(); goBack(); }
            if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
            if (e.key === "Home")       { e.preventDefault(); goStart(); }
            if (e.key === "End")        { e.preventDefault(); goEnd(); }
        }
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [goBack, goNext, goStart, goEnd]);

    function handleBranchSelect(branchId: string | null) {
        console.log("GamePanel handleBranchSelect called with:", branchId);
        if (branchId) {
            const branch = branches.find(b => b.id === branchId);
            console.log("Branch ID: ", branch);
            if (branch) {
                onBranchSelect(branchId);
                try {
                    const c = new Chess();
                    c.loadPgn(branch.pgn);
                    const hist = c.history({ verbose: true });
                    const lastMove = hist[hist.length - 1];
                    console.log("Branch lastMove:", lastMove);
                    onNavigate(branch.fen, lastMove ? { from: lastMove.from, to: lastMove.to } : null);  
                } catch {
                    onNavigate(branch.fen, null);
                }
            }
        } else {
            // onNavigate(cursor === -1 ? null : fenHistory[activeCursor] ?? null);
            onNavigate(null, null);
        }
    }

    return (
        <div className="flex flex-col min-h-0 sm:h-full border border-border rounded-sm bg-card overflow-hidden">
            {/* The two clocks intentionally live in separate player sections. */}
            <div className={cn(
                "flex items-center gap-3 px-4 py-3 border-l-[3px] border-b border-border transition-all duration-200",
                !isWhiteTurn ? "border-l-red-500 bg-red-500/10" : "border-l-transparent"
            )}>
                <div className="size-4 rounded-full bg-[#1a1a1a] border border-white/20 shrink-0 dark:border-white/10" />
                <span className={cn("min-w-0 truncate text-sm font-semibold transition-colors", !isWhiteTurn && "text-red-600 dark:text-red-400")}>
                    {BlackName}
                </span>
                {!isWhiteTurn && <span className="size-2 rounded-full bg-red-500 animate-pulse shrink-0" />}
                {blackClockMs !== undefined && (
                    <span className={cn("ml-auto shrink-0 font-mono text-lg font-semibold tabular-nums", activeClockSide === "black" ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                        {formatClockMs(blackClockMs)}
                    </span>
                )}
            </div>

            {/* ── Navigation controls ── */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/20">
                <div className="grid flex-1 grid-cols-4 gap-1">
                    <Button variant="ghost" size="icon" className="h-9 w-full" onClick={goStart} disabled={activeCursor === 0}>
                        <ChevronsLeft className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-full" onClick={goBack} disabled={activeCursor === 0}>
                        <ChevronLeft className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-full" onClick={goNext} disabled={activeCursor === totalMoves}>
                        <ChevronRight className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-full" onClick={goEnd} disabled={activeCursor === totalMoves}>
                        <ChevronsRight className="size-4" />
                    </Button>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground font-mono tabular-nums select-none">
                    {activeCursor}/{totalMoves}
                </span>
            </div>

            {/* ── PGN move list ── */}
            <div className="flex flex-col h-[clamp(180px,35vh,280px)] sm:h-auto sm:flex-1 sm:min-h-0 border-b border-border">
                <PGNTable
                    pgn={activePGN}
                    mainPgn={mainPgnBeforeBranch || pgn}
                    cursor={activeCursor}
                    moveTimesMap={moveTimesMap}
                    onGoTo={(idx) => goTo(idx)}
                    branches={branches}
                    selectedBranchId={selectedBranchId}
                    onBranchSelect={handleBranchSelect}
                />
            </div>

            <div className={cn(
                "flex items-center gap-3 px-4 py-3 border-l-[3px] border-b border-border transition-all duration-200",
                isWhiteTurn ? "border-l-green-500 bg-green-500/10" : "border-l-transparent"
            )}>
                <div className="size-4 rounded-full bg-[#f0f0f0] border border-black/15 shrink-0" />
                <span className={cn("min-w-0 truncate text-sm font-semibold transition-colors", isWhiteTurn && "text-green-700 dark:text-green-400")}>
                    {WhiteName}
                </span>
                {isWhiteTurn && <span className="size-2 rounded-full bg-green-500 animate-pulse shrink-0" />}
                {whiteClockMs !== undefined && (
                    <span className={cn("ml-auto shrink-0 font-mono text-lg font-semibold tabular-nums", activeClockSide === "white" ? "text-green-700 dark:text-green-400" : "text-muted-foreground")}>
                        {formatClockMs(whiteClockMs)}
                    </span>
                )}
            </div>

            {/* ── Game actions ── */}
            <GameActions
                gameID={gameID}
                branches={branches}
                onRestart={onRestart}
                onResign={onResign}
                isAdmin={isAdmin}
            />
        </div >
    );
});
