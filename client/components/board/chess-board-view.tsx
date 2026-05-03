"use client";

import { Chessboard } from "react-chessboard";

interface Props {
  fen:              string;
  lastMove:         { from: string; to: string } | null;
  /** Controlled size in px — board renders as a boardWidth × boardWidth square */
  boardWidth?:      number;
  /** Extra per-square styles merged on top of lastMove highlight */
  highlightSquares?: Record<string, React.CSSProperties>;
}

export function ChessBoardView({ fen, lastMove, boardWidth, highlightSquares }: Props) {
  const squareStyles: Record<string, React.CSSProperties> = { ...highlightSquares };
  if (lastMove) {
    squareStyles[lastMove.from] = { background: "rgba(236,243,116,0.75)" };
    squareStyles[lastMove.to]   = { background: "rgba(236,243,116,0.75)" };
  }

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
      customBoardStyle={{
        borderRadius: "3px",
        border: "1px solid hsl(var(--border))",
        overflow: "hidden",
      }}
      customDarkSquareStyle={{ backgroundColor: "#7b6040" }}
      customLightSquareStyle={{ backgroundColor: "#e8e8e8" }}
    />
  );
}
