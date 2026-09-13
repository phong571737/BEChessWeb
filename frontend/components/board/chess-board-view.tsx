"use client";

import { forwardRef, useMemo, type CSSProperties, type ReactNode } from "react";
import { Chessboard } from "react-chessboard";
import { Chess, type Color, type Square } from "chess.js";
import { useBoardDisplay } from "@/components/providers/board-display-provider";
import { moveClassificationBoardTone, moveClassificationMark } from "@/lib/move-classification";
import type { MoveClassification } from "@/lib/post-game-analysis";

interface MoveAnnotation {
  square: string;
  classification: MoveClassification;
  label: string;
}

export interface PredictedMove {
  from: Square;
  to: Square;
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
  /** Best move returned by Stockfish for the currently displayed FEN. */
  predictedMove?: PredictedMove | null;
  /** Board orientation controlled by the owning board slot. */
  flipped?: boolean;
}

interface KingThreat {
  square: Square;
  checkmate: boolean;
}

/**
 * Finds an attacked king from piece geometry instead of trusting the FEN turn.
 * Persisted physical-board snapshots can contain a stale active color or omit
 * the opposite king, so strict FEN validation would hide a visible check.
 */
export function findKingThreat(fen: string): KingThreat | null {
  try {
    const position = new Chess(fen || undefined, { skipValidation: true });
    const activeColor = position.turn();
    const colors: Color[] = [activeColor, activeColor === "w" ? "b" : "w"];

    for (const color of colors) {
      const [kingSquare] = position.findPiece({ type: "k", color });
      const attackingColor: Color = color === "w" ? "b" : "w";

      if (!kingSquare || !position.isAttacked(kingSquare, attackingColor)) {
        continue;
      }

      // Evaluate mate from the attacked king's perspective even when the
      // persisted active-color field points at the wrong side.
      position.setTurn(color);
      return {
        square: kingSquare,
        checkmate: position.isCheckmate(),
      };
    }
  } catch {
    // Keep rendering when even the piece-placement field cannot be parsed.
  }

  return null;
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
  predictedMove,
  flipped: flippedOverride,
}: Props) {
  const { flipped: contextFlipped, boardColors } = useBoardDisplay();
  const flipped = flippedOverride ?? contextFlipped;
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

  const kingThreat = useMemo(() => findKingThreat(fen), [fen]);
  const predictedArrows = useMemo(() => {
    if (!predictedMove) return [];
    return [[predictedMove.from, predictedMove.to, "hsl(var(--accent))"]] as [Square, Square, string][];
  }, [predictedMove]);

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

  if (kingThreat) {
    squareStyles[kingThreat.square] = {
      ...squareStyles[kingThreat.square],
      background: kingThreat.checkmate
        ? "hsl(var(--state-checkmate) / 0.78)"
        : "hsl(var(--state-check) / 0.72)",
      boxShadow: kingThreat.checkmate
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
      customArrows={predictedArrows}
      customArrowColor="hsl(var(--accent))"
      areArrowsAllowed={false}
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
