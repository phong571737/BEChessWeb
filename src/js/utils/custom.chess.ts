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

function moveToSanUnchecked(game: Chess, move: MoveLike): string {
  const piece = game.get(move.from);
  if (!piece) return move.from + move.to;

  if (piece.type === "k") {
    const df = FILES.indexOf(fileOf(move.to)) - FILES.indexOf(fileOf(move.from));
    if (Math.abs(df) === 2 && rankOf(move.from) === rankOf(move.to)) {
      return df > 0 ? "O-O" : "O-O-O";
    }
  }

  const targetPiece = game.get(move.to);
  const isCapture = !!targetPiece;

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

  return san;
}

function applyRawMove(game: Chess, move: MoveLike): void {
  const piece = game.get(move.from);
  if (!piece) throw new Error(`No piece at ${move.from}`);

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
}

export function customPGN(
  moves: MoveLike[],
  startFen?: string,
  headers: Record<string, string> = {}
): { pgn: string } {
  const game = new Chess(startFen, { skipValidation: true });

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

  for (const move of moves) {
    const san = moveToSanUnchecked(game, move); 

    if (turn === "w") {
      if (moveString.length) moveParts.push(moveString);
      moveString = `${moveNumber}.`;
      moveNumber++;
    }
    moveString += " " + san;

    applyRawMove(game, move); 
    turn = turn === "w" ? "b" : "w";
  }

  if (moveString.length) moveParts.push(moveString);
  moveParts.push(defaultHeaders.Result!);

  const headerLines: string[] = [];
  const gh = game.getHeaders();
  for (const key in gh) {
    if (key === "SetUp" || key === "FEN") continue;
    headerLines.push(`[${key} "${gh[key]}"]`);
  }

  return {
    pgn: headerLines.join("\n") + "\n\n" + moveParts.join(" "),
  };
}


