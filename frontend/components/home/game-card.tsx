"use client"

import { ActiveGame } from "@/types/game.types";
import dynamic from "next/dynamic"
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { encodeGameID } from "@/lib/id-utils";
import { useBoardDisplay } from "@/components/providers/board-display-provider";
import { useT } from "@/lib/i18n";
import { classifyTimeControl } from "@/lib/time-control";

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
  const { t } = useT();
  const timeControl = game.timeControlType ?? classifyTimeControl(game.initialTimeMs);
  const timeControlLabel = {
    blitz: t("timeControl.blitz"),
    rapid: t("timeControl.rapid"),
    classical: t("timeControl.classical"),
  }[timeControl];

  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return;
    const update = () => setBoardWidth(Math.max(0, Math.floor(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the home mini-board neutral. Last-move highlighting remains enabled
  // on the full board and review pages where move navigation is available.
  // const squareStyles = useMemo<Record<string, React.CSSProperties>>(() => {
  //   if (!game.lastMove) return {};
  //   return {
  //     [game.lastMove.from]: { background: "rgba(236,243,116,0.75)" },
  //     [game.lastMove.to]: { background: "rgba(236,243,116,0.75)" },
  //   };
  // }, [game.lastMove]);

  return (
    <Link
      href={boardUrl}
      className="group flex flex-col bg-card rounded-lg border border-border overflow-hidden cursor-pointer transition-all duration-150 hover:border-border/80 hover:shadow-md hover:-translate-y-px"
      onMouseEnter={() => router.prefetch(boardUrl)}
      onFocus={() => router.prefetch(boardUrl)}
      aria-label={t("home.openGame", { players: `${game.WhiteName} vs ${game.BlackName}` })}
    >
      {/* Mini board */}
      <div ref={boardWrapRef} className="w-full aspect-square overflow-hidden">
        {boardWidth >= 80 ? (
          <Chessboard
            position={game.fen || "start"}
            arePiecesDraggable={false}
            customDarkSquareStyle={{ backgroundColor: boardColors.dark }}
            customLightSquareStyle={{ backgroundColor: boardColors.light }}
            boardWidth={boardWidth}
          />
        ) : (
          <div className="w-full h-full bg-muted animate-pulse" />
        )}
      </div>

      {/* Player names footer */}
      <div className="flex items-center gap-2 border-t border-border bg-card px-3 py-2">
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
      <div className="border-t border-border/70 bg-muted/30 px-3 py-1.5">
        <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          {timeControlLabel}
        </span>
      </div>
    </Link>
  );
}
