"use client";

import { forwardRef, useMemo, type CSSProperties, type ReactNode } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useBoardDisplay } from "@/components/providers/board-display-provider";
import { moveClassificationBoardTone, moveClassificationMark } from "@/lib/move-classification";
import type { MoveClassification } from "@/lib/post-game-analysis";

interface MoveAnnotation {
  square: string;
  classification: MoveClassification;
  label: string;
}

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
  /** Optional Lichess-style analysis mark rendered on the reviewed move's destination square. */
  moveAnnotation?: MoveAnnotation | null;
}

export function ChessBoardView({ 
  fen, 
  lastMove, 
  boardWidth, 
  
  highlightSquares, 

  missingSquares,
  extraSquares,
  wrongPieceSquares,
  moveAnnotation,
}: Props) {
  const { flipped, boardColors } = useBoardDisplay();
  const squareStyles: Record<string, React.CSSProperties> = { ...highlightSquares };
  const CustomSquare = useMemo(() => {
    const AnnotatedSquare = forwardRef<HTMLDivElement, {
      children: ReactNode;
      square: string;
      style: CSSProperties;
    }>(({ children, square, style }, ref) => (
      <div ref={ref} style={{ ...style, position: "relative" }}>
        {children}
        {moveAnnotation?.square === square && (
          <span
            className={`pointer-events-none absolute right-[3%] top-[3%] z-30 inline-flex size-[38%] min-h-6 min-w-6 max-h-9 max-w-9 items-center justify-center rounded-full border-2 text-[clamp(11px,1.8vw,15px)] font-black leading-none shadow-lg ring-2 ring-background/90 ${moveClassificationBoardTone[moveAnnotation.classification]}`}
            title={moveAnnotation.label}
            aria-label={moveAnnotation.label}
          >
            {moveClassificationMark[moveAnnotation.classification]}
          </span>
        )}
      </div>
    ));
    AnnotatedSquare.displayName = "AnnotatedChessSquare";
    return AnnotatedSquare;
  }, [moveAnnotation]);

  // Derive the checked king from the current position. This also covers FEN
  // review, MQTT updates, and restarts; malformed legacy FEN is ignored.
  let checkedKingSquare: string | null = null;
  let checkmate = false;
  try {
    const position = new Chess(fen || "start");
    if (position.isCheck()) {
      const checkedColor = position.turn();
      const files = "abcdefgh";
      position.board().forEach((rank, rankIndex) => {
        rank.forEach((piece, fileIndex) => {
          if (piece?.type === "k" && piece.color === checkedColor) {
            checkedKingSquare = `${files[fileIndex]}${8 - rankIndex}`;
          }
        });
      });
      checkmate = position.isCheckmate();
    }
  } catch {
    // Keep rendering even when a legacy/custom snapshot is not valid chess.
  }

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

  if (checkedKingSquare) {
    squareStyles[checkedKingSquare] = {
      ...squareStyles[checkedKingSquare],
      background: checkmate
        ? "hsl(var(--state-checkmate) / 0.78)"
        : "hsl(var(--state-check) / 0.72)",
      boxShadow: checkmate
        ? "inset 0 0 0 3px hsl(var(--state-checkmate)), 0 0 18px hsl(var(--state-checkmate) / 0.72)"
        : "inset 0 0 0 3px hsl(var(--state-check)), 0 0 16px hsl(var(--state-check) / 0.65)",
      animation: "king-check-pulse 1.05s ease-in-out infinite",
      zIndex: 2,
    };
  }

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
      customSquare={CustomSquare}
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
