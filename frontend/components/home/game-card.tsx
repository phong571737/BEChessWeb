"use client"

import { ActiveGame } from "@/types/game.types";
import dynamic from "next/dynamic"
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useEffect, useMemo } from "react";
import { encodeGameID } from "@/lib/id-utils";
import { useBoardDisplay } from "@/components/providers/board-display-provider";

const Chessboard = dynamic(
    () => import("react-chessboard").then((m) => m.Chessboard),
    {ssr: false, loading: () => <div className="w-full aspect-square bg-muted animate-pulse"></div> }
);

interface Props {
    game: ActiveGame;
}

export function GameCard({ game }: Props) {
  const router = useRouter();
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(0);
  const boardUrl = `/board?id=${encodeGameID(game.gameID)}`;
  const { boardColors } = useBoardDisplay();

  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return;
    const update = () => setBoardWidth(Math.max(0, Math.floor(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const squareStyles = useMemo<Record<string, React.CSSProperties>>(() => {
    if (!game.lastMove) return {};
    return {
      [game.lastMove.from]: { background: "rgba(236,243,116,0.75)" },
      [game.lastMove.to]:   { background: "rgba(236,243,116,0.75)" },
    };
  }, [game.lastMove]);

  return (
    <Link
      href={boardUrl}
      className="group flex flex-col bg-card rounded-lg border border-border overflow-hidden cursor-pointer transition-all duration-150 hover:border-border/80 hover:shadow-md hover:-translate-y-px"
      onMouseEnter={() => router.prefetch(boardUrl)}
      onFocus={() => router.prefetch(boardUrl)}
      aria-label={`Open game ${game.WhiteName} vs ${game.BlackName}`}
    >
      {/* Mini board */}
      <div ref={boardWrapRef} className="w-full aspect-square overflow-hidden">
        {boardWidth >= 80 ? (
          <Chessboard
            position={game.fen || "start"}
            arePiecesDraggable={false}
            customSquareStyles={squareStyles}
            customDarkSquareStyle={{ backgroundColor: boardColors.dark }}
            customLightSquareStyle={{ backgroundColor: boardColors.light }}
            boardWidth={boardWidth}
          />
        ) : (
          <div className="w-full h-full bg-muted animate-pulse" />
        )}
      </div>

      {/* Player names footer */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-card">
        {/* White */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="size-2.5 rounded-full bg-[#f0f0f0] border border-black/15 shrink-0" />
          <span className="text-xs font-medium text-foreground truncate">{game.WhiteName}</span>
        </div>
        <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider shrink-0">vs</span>
        {/* Black */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
          <span className="text-xs font-medium text-foreground truncate text-right">{game.BlackName}</span>
          <span className="size-2.5 rounded-full bg-[#1a1a1a] border border-white/10 shrink-0" />
        </div>
      </div>
    </Link>
  );
}
