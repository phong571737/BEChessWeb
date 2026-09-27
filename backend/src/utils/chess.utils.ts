import { Chess, Move, PieceSymbol, Color, Square } from "chess.js";
import { MOVE_STATUS } from "../constant.js";
import { UCIMove } from "../types/move.types.js";


/**
 * Compare two FEN positions and infer the move (UCI) that was played.
 * Works by finding the square that lost a piece (from) and the square
 * that gained one (to).  Handles captures and en-passant correctly.
 * Returns null if no single unambiguous move can be inferred.
 */
export function inferMoveFromFen(beforeFen: string, afterFen: string): { from: string; to: string; promotion?: string } | null {
  try {
    const before = new Chess();
    before.load(beforeFen, { skipValidation: true });
    const after = new Chess();
    after.load(afterFen, { skipValidation: true });

    const files = "abcdefgh";
    const ranks = "12345678";

    // Collect all squares where a piece exists in each position
    const beforeSquares: string[] = [];
    const afterSquares: string[] = [];

    for (const f of files) {
      for (const r of ranks) {
        const sq = f + r;
        if (before.get(sq as Square)) beforeSquares.push(sq);
        if (after.get(sq as Square)) afterSquares.push(sq);
      }
    }

    // Squares that lost a piece (in before but not after)
    const lostSquares = beforeSquares.filter(sq => !afterSquares.includes(sq));
    // Squares that gained a piece (in after but not before)
    const gainedSquares = afterSquares.filter(sq => !beforeSquares.includes(sq));

    if (lostSquares.length === 0 && gainedSquares.length === 0) {
      // No change — nothing to infer
      return null;
    }

    // --- Non-capture move: one lost, one gained ---
    if (lostSquares.length === 1 && gainedSquares.length === 1) {
      const from = lostSquares[0]!;
      const to = gainedSquares[0]!;
      return checkPromotion(before, after, from, to);
    }

    // --- Capture: the moving piece disappears from one square ---
    // The captured piece also disappears, so we have 2 lost squares and 1 gained.
    // The gained square is where the moving piece landed.
    // The moving piece's color on the target matches its color on the origin.
    if ((lostSquares.length === 2 && gainedSquares.length === 1) ||
        (lostSquares.length === 1 && gainedSquares.length === 1 && before.get(lostSquares[0] as Square)?.color !== after.get(gainedSquares[0] as Square)?.color)) {
      const to = gainedSquares[0]!;
      const pieceAtTarget = after.get(to as Square);
      if (!pieceAtTarget) return null;

      // Find which lost square had a piece of the same color as the target
      const matchingFrom = lostSquares.find(sq => {
        const p = before.get(sq as Square);
        return p && p.color === pieceAtTarget.color;
      });
      if (matchingFrom) {
        return checkPromotion(before, after, matchingFrom, to);
      }
    }

    // --- Castle: king and rook disappear from two squares, appear on two others ---
    // King moves 2 squares, rook moves 1 square → 2 lost, 2 gained
    if (lostSquares.length === 2 && gainedSquares.length === 2) {
      // Find the king (piece type "k")
      const kingFrom = lostSquares.find(sq => before.get(sq as Square)?.type === "k");
      const kingTo = gainedSquares.find(sq => after.get(sq as Square)?.type === "k");
      if (kingFrom && kingTo) {
        return { from: kingFrom, to: kingTo };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/** Helper: check for promotion when a pawn reaches the 8th rank */
function checkPromotion(before: Chess, after: Chess, from: string, to: string): { from: string; to: string; promotion?: string } {
  const pieceBefore = before.get(from as Square);
  const pieceAfter = after.get(to as Square);
  let promotion: string | undefined;
  if (pieceBefore?.type === "p" && pieceAfter && pieceAfter.type !== "p") {
    promotion = pieceAfter.type;
  }
  return { from, to, promotion };
}

export function parseUCI(uci: string): UCIMove {
    return {
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length === 5 ? uci[4] : undefined
    }
}

export function formatUCI(from: string, to: string, promotion?: string) {
    return from + to + (promotion ?? "");
}

export function buildResponse(gameID: string, game: Chess, seq: number, extra = {}) {
    return {
        status: MOVE_STATUS.OK,
        gameID,
        fen: game.fen(),
        pgn: game.pgn(),
        lastSeq: seq,
        ...extra
    }
}

// This function is used to execute move
export function executeMove(game: Chess, move: UCIMove): Move | null {
    return game.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion
    }) 
}

export function applyRawMove(
  game: Chess,
  from: string,
  to: string,
  promotion?: string
): { pieceType: PieceSymbol; color: Color; captured: PieceSymbol | null } | null {
  const piece = game.get(from as any);
  if (!piece) return null;

  const capturedPiece = game.get(to as any);
  const captured = capturedPiece ? capturedPiece.type : null;

  // Handle castling: when king moves 2 squares, also relocate the rook
  if (piece.type === "k") {
    const fromFile = from.charCodeAt(0); // 'e' = 101
    const toFile   = to.charCodeAt(0);
    const df = toFile - fromFile;
    const fromRank = from[1];
    const toRank   = to[1];

    if (Math.abs(df) === 2 && fromRank === toRank) {
      if (df > 0) {
        // King-side castling: rook h→f
        const rookFrom = ("h" + fromRank) as any;
        const rookTo   = ("f" + fromRank) as any;
        const rook = game.get(rookFrom);
        if (rook) {
          game.remove(rookFrom);
          game.put(rook, rookTo);
        }
      } else {
        // Queen-side castling: rook a→d
        const rookFrom = ("a" + fromRank) as any;
        const rookTo   = ("d" + fromRank) as any;
        const rook = game.get(rookFrom);
        if (rook) {
          game.remove(rookFrom);
          game.put(rook, rookTo);
        }
      }
    }
  }

  game.remove(from as any);
  game.remove(to as any);

  const newType = (promotion as PieceSymbol) ?? piece.type;
  game.put({ type: newType, color: piece.color }, to as any);

  toggleTurnAndCounters(game);

  return { pieceType: piece.type, color: piece.color, captured };
}

function toggleTurnAndCounters(game: Chess): void {
  const parts = game.fen().split(" ");
  if (parts.length < 6) {
    throw new Error(`Invalid FEN, expected 6 parts: ${game.fen()}`);
  }

  const [placement, turn, castling, , halfmove, fullmoveStr] = parts;

  const nextTurn = turn === "w" ? "b" : "w";
  let fullmove = parseInt(fullmoveStr ?? "1", 10);
  if (nextTurn === "w") fullmove += 1;

  const newHalfmove = String(parseInt(halfmove ?? "0", 10) + 1);

  const newFen = [placement, nextTurn, castling, "-", newHalfmove, String(fullmove)].join(" ");
  game.load(newFen, {skipValidation: true});
}