import { Chess, Move, PieceSymbol, Color, Square } from "chess.js";
import { MOVE_STATUS } from "../constant.js";
import { UCIMove } from "../types/move.types.js";


/**
 * Compare two FEN positions and infer the move (UCI) that was played.
 * Works by finding the square that lost a piece (from) and the square
 * that gained one (to).  Handles captures and en-passant correctly.
 * Returns null if no single unambiguous move can be inferred.
 */
export function inferMoveFromFen(beforeFen: string, afterFen: string) {
  try {
    const afterFields = afterFen.trim().split(/\s+/);
    const beforeFields = beforeFen.trim().split(/\s+/);
    const afterPlacement = afterFields[0];
    const beforePlacement = beforeFields[0];

    if (!afterPlacement || !beforePlacement || afterPlacement === beforePlacement) return null;

    // The board clock owns the active-color field. A valid move switches it,
    // therefore the side that moved is the opposite of the resulting turn.
    const movedColor = afterFields[1] === "b" ? "w" : "b";
    beforeFields[1] = movedColor;
    const source = new Chess(beforeFields.join(" "), { skipValidation: true });
    const matches: Move[] = [];

    for (const legalMove of source.moves({ verbose: true })) {
      const trial = new Chess(source.fen(), { skipValidation: true });
      trial.move({ from: legalMove.from, to: legalMove.to, promotion: legalMove.promotion });
      if (trial.fen().split(/\s+/)[0] === afterPlacement) matches.push(legalMove);
    }

    return matches.length === 1 ? matches[0] : null;
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
