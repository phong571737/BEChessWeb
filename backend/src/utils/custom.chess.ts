import { Chess, Color, PieceSymbol, Square } from "chess.js";
import { MoveLike } from "../types/chess.types.js";

const FILES = "abcdefgh";
const RANKS = "12345678";

function fileOf(sq: Square): string {
    return sq.charAt(0);
}

function rankOf(sq: Square): string {
    return sq.charAt(1);
}

function findAmbiguousPieces(
    game: Chess, 
    from: Square, 
    to: Square, 
    pieceType: 
    PieceSymbol, 
    color: Color
): Square[] {
    const result: Square[] = [];

    for (const f of FILES) {
        for (const r of RANKS) {
            const sq = (f + r) as Square;
            if (sq === from) continue;

            const p = game.get(sq);
            if (!p || p.type !== pieceType || p.color !== color) continue;

            if (canPseudoReach(pieceType,sq, to)) {
                result.push(sq);
            }
        }
    }

    return result;
}

function canPseudoReach(piece: PieceSymbol, from: Square, to: Square): boolean {
  const f1 = FILES.indexOf(fileOf(from));
  const r1 = RANKS.indexOf(rankOf(from));
  const f2 = FILES.indexOf(fileOf(to));
  const r2 = RANKS.indexOf(rankOf(to));
  const df = Math.abs(f2 - f1);
  const dr = Math.abs(r2 - r1);

  switch (piece) {
    case "n":
      return (df === 1 && dr === 2) || (df === 2 && dr === 1);
    case "b":
      return df === dr && df !== 0;
    case "r":
      return (df === 0 && dr !== 0) || (dr === 0 && df !== 0);
    case "q":
      return df === dr || df === 0 || dr === 0;
    case "k":
      return df <= 1 && dr <= 1 && (df !== 0 || dr !== 0);
    default:
      return false;
  }
}

function getDisambiguator(
  game: Chess,
  from: Square,
  to: Square,
  pieceType: PieceSymbol,
  color: Color
): string {
  const ambiguous = findAmbiguousPieces(game, from, to, pieceType, color);

  if (ambiguous.length === 0) return "";

  let sameFile = 0, sameRank = 0;

  for (const sq of ambiguous) {
    if (fileOf(sq) === fileOf(from)) sameFile++;
    if (rankOf(sq) === rankOf(from)) sameRank++;
  }

  if (sameFile > 0 && sameRank > 0) return from; 
  if (sameFile > 0) return rankOf(from);          
  return fileOf(from);                             
}

function isEnPassant(game: Chess, move: MoveLike): boolean {
  const piece = game.get(move.from);
  if (!piece || piece.type !== "p") return false;
  // En-passant: pawn moves diagonally to an empty square ≠ starting file
  return fileOf(move.from) !== fileOf(move.to) && !game.get(move.to);
}

function statusSuffixFromFen(fen: string | undefined): string | null {
  if (!fen?.trim()) return null;
  try {
    const position = new Chess(fen, { skipValidation: true });
    if (position.isCheckmate()) return "#";
    if (position.isCheck()) return "+";
    return "";
  } catch {
    return null;
  }
}

function moveToSanUnchecked(game: Chess, move: MoveLike, authoritativeAfterFen?: string): string {
  const piece = game.get(move.from);
  if (!piece) return "x";

  // Castling
  if (piece.type === "k") {
    const df = FILES.indexOf(fileOf(move.to)) - FILES.indexOf(fileOf(move.from));
    if (Math.abs(df) === 2 && rankOf(move.from) === rankOf(move.to)) {
      return df > 0 ? "O-O" : "O-O-O";
    }
  }

  const targetPiece = game.get(move.to);
  const isCapture = !!targetPiece || isEnPassant(game, move);

  let san = "";

  if (piece.type !== "p") {
    san += piece.type.toUpperCase();
    san += getDisambiguator(game, move.from, move.to, piece.type, piece.color);
  }

  if (isCapture) {
    if (piece.type === "p") san += fileOf(move.from);
    san += "x";
  }

  san += move.to;

  if (move.promotion) {
    san += "=" + move.promotion.toUpperCase();
  }

  // An ESP FEN is the authoritative position after a raw move. It preserves
  // check and mate notation even when the UCI history is incomplete or does
  // not form a legal chess.js game. Fall back to local reconstruction only
  // when no usable FEN snapshot is available.
  const authoritativeSuffix = statusSuffixFromFen(authoritativeAfterFen);
  if (authoritativeSuffix !== null) return san + authoritativeSuffix;

  // Add check (+) / checkmate (#) based on the position *after* the move
  // Because the board state hasn't been updated yet, we apply the move,
  // check the status, then undo it.
  // Clone approach: create a temp game, apply the move, check status.
  try {
    const tmp = new Chess(game.fen(), { skipValidation: true });
    const tmpPiece = tmp.get(move.from);
    if (tmpPiece) {
      if (tmpPiece.type === "k") {
        const df2 = FILES.indexOf(fileOf(move.to)) - FILES.indexOf(fileOf(move.from));
        if (Math.abs(df2) === 2 && rankOf(move.from) === rankOf(move.to)) {
          const rank = rankOf(move.from);
          if (df2 > 0) {
            const rookFrom = ("h" + rank) as Square;
            const rookTo   = ("f" + rank) as Square;
            const rook = tmp.get(rookFrom);
            if (rook) { tmp.remove(rookFrom); tmp.put(rook, rookTo); }
          } else {
            const rookFrom = ("a" + rank) as Square;
            const rookTo   = ("d" + rank) as Square;
            const rook = tmp.get(rookFrom);
            if (rook) { tmp.remove(rookFrom); tmp.put(rook, rookTo); }
          }
        }
      }
      tmp.remove(move.from);
      tmp.remove(move.to);
      tmp.put({ type: move.promotion ?? tmpPiece.type, color: tmpPiece.color }, move.to);

      // chess.js evaluates check against the side to move. Raw custom moves
      // intentionally do not validate or advance its turn, so reconstruct the
      // resulting position with the opponent to move before testing + / #.
      const fields = tmp.fen().split(" ");
      fields[1] = tmpPiece.color === "w" ? "b" : "w";
      const afterMove = new Chess(fields.join(" "), { skipValidation: true });
      if (afterMove.isCheckmate()) {
        san += "#";
      } else if (afterMove.isCheck()) {
        san += "+";
      }
    }
  } catch {
    // If the clone fails, skip the check annotation
  }

  return san;
}

function applyRawMove(game: Chess, move: MoveLike): boolean {
  const piece = game.get(move.from);
  if (!piece) {
    // Invalid move — no piece at from-square. Return false so the
    // caller can skip this move instead of crashing the PGN builder.
    return false;
  }

  if (piece.type === "k") {
    const df = FILES.indexOf(fileOf(move.to)) - FILES.indexOf(fileOf(move.from));
    if (Math.abs(df) === 2 && rankOf(move.from) === rankOf(move.to)) {
      const rank = rankOf(move.from);
      if (df > 0) {
        // near castling
        const rookFrom = ("h" + rank) as Square;
        const rookTo = ("f" + rank) as Square;
        const rook = game.get(rookFrom);
        if (rook) {
          game.remove(rookFrom);
          game.put(rook, rookTo);
        }
      } else {
        // long castling(queenside):
        const rookFrom = ("a" + rank) as Square;
        const rookTo = ("d" + rank) as Square;
        const rook = game.get(rookFrom);
        if (rook) {
          game.remove(rookFrom);
          game.put(rook, rookTo);
        }
      }
    }
  }

  game.remove(move.from);
  game.remove(move.to);
  game.put({ type: move.promotion ?? piece.type, color: piece.color }, move.to);
  return true;
}

export function customPGN(
  moves: MoveLike[],
  startFen?: string,
  headers: Record<string, string> = {},
  fenHistory: string[] = [],
): { pgn: string } {
  let game: Chess;
  let usableStartFen: string | undefined;
  if (startFen?.trim()) {
    try {
      game = new Chess(startFen, { skipValidation: true });
      usableStartFen = startFen;
    } catch {
      game = new Chess();
    }
  } else {
    game = new Chess();
  }

  const defaultHeaders: Record<string, string> = {
    Event: "?",
    Site: "?",
    Date: "????.??.??",
    Round: "1",
    White: "?",
    Black: "?",
    Result: "*",
    ...headers,
  };
  for (const key in defaultHeaders) {
    game.setHeader(key, defaultHeaders[key]!);
  }

  let turn: Color = game.turn();
  let moveNumber = game.moveNumber();
  let moveString = "";
  const moveParts: string[] = [];

  for (const [index, move] of moves.entries()) {
    const san = moveToSanUnchecked(game, move, fenHistory[index]);

    if (turn === "w") {
      if (moveString.length) moveParts.push(moveString);
      moveString = `${moveNumber}.`;
      moveNumber++;
    }
    moveString += " " + san;

    const applied = applyRawMove(game, move);
    if (!applied) {
      // Invalid move (e.g. no piece at from-square) — do NOT flip the
      // turn because the board state didn't actually change.
      // The SAN text "xx" is still appended so the PGN shows the attempt.
    } else {
      turn = turn === "w" ? "b" : "w";
    }
  }

  if (moveString.length) moveParts.push(moveString);
  moveParts.push(defaultHeaders.Result!);

  const headerLines: string[] = [];
  const gh = game.getHeaders();
  if (usableStartFen && usableStartFen !== new Chess().fen()) {
    headerLines.push(`[SetUp "1"]`);
    headerLines.push(`[FEN "${usableStartFen}"]`);
  }
  for (const key in gh) {
    if (key === "SetUp" || key === "FEN") continue;
    headerLines.push(`[${key} "${gh[key]}"]`);
  }

  return {
    pgn: headerLines.join("\n") + "\n\n" + moveParts.join(" "),
  };
}


