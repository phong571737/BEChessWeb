"use client";

import { Chessboard } from "react-chessboard";
import { useBoardDisplay } from "@/components/providers/board-display-provider";

interface Props {
  fen:              string;
  lastMove:         { from: string; to: string } | null;
  /** Controlled size in px — board renders as a boardWidth × boardWidth square */
  boardWidth?:      number;
  /** Extra per-square styles merged on top of lastMove highlight */
  highlightSquares?: Record<string, React.CSSProperties>;
  missingSquares?: string[];
  extraSquares?: string[];
  wrongPieceSquares?: string[];
}

export function ChessBoardView({ 
  fen, 
  lastMove, 
  boardWidth, 
  
  highlightSquares, 

  missingSquares,
  extraSquares,
  wrongPieceSquares,
}: Props) {
  const { flipped, boardColors } = useBoardDisplay();
  const squareStyles: Record<string, React.CSSProperties> = { ...highlightSquares };

  // ================ Initcheck =========================
  // Missing piece
  missingSquares?.forEach((sq) => {
    squareStyles[sq] = {
      ...squareStyles[sq],
      background: "rgba(255,0,0,0.55)",
    }
  });

  // Extra piece 
  extraSquares?.forEach((sq) => {
    squareStyles[sq] = {
      ...squareStyles[sq],
      background: "rgba(255,165,0,0.55)",
    }
  });

  // Wrong piece
  wrongPieceSquares?.forEach((item: any) => {
    const sq = item.square;
    squareStyles[sq] = {
      background: "rgba(255,255,0,0.55)",
    }
  });

  // if (lastMove) {
  //   squareStyles[lastMove.from] = { background: "rgba(236,243,116,0.75)" };
  //   squareStyles[lastMove.to]   = { background: "rgba(236,243,116,0.75)" };
  // }

  // Loading skeleton before the parent has measured its size
  if (!boardWidth || boardWidth < 120) {
    return (
      <div className="w-full aspect-square bg-muted animate-pulse rounded-sm border border-border" />
    );
  }

  // Render the board directly — no wrapper div, so overflow-hidden / size
  // mismatches can never clip the board.  Border + radius go via customBoardStyle.
  return (
    <Chessboard
      position={fen || "start"}
      arePiecesDraggable={false}
      customSquareStyles={squareStyles}
      boardWidth={boardWidth}
      boardOrientation={flipped ? "black" : "white"}
      customBoardStyle={{
        borderRadius: "3px",
        border: "1px solid hsl(var(--border))",
        overflow: "hidden",
      }}
      customDarkSquareStyle={{ backgroundColor: boardColors.dark }}
      customLightSquareStyle={{ backgroundColor: boardColors.light }}
    />
  );
}
