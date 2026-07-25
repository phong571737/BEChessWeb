import { Chess } from "chess.js";
import type { HistoryGame } from "@/types/game.types";

export type PieceCode = "p" | "n" | "b" | "r" | "q" | "k";

export type AnalysisLabels = {
  pieces: Record<PieceCode, string>;
  moveTypes: {
    normal: string;
    capture: string;
    check: string;
    castle: string;
    promotion: string;
  };
};

type MoveVerbose = {
  color: "w" | "b";
  piece: PieceCode;
  captured?: PieceCode;
  promotion?: "q" | "r" | "b" | "n";
  san: string;
  flags: string;
  from: string;
  to: string;
};

type AnalysisGame = Pick<HistoryGame, "pgn" | "uciHistory" | "fenHistory"> & {
  initialFen?: string;
  startFen?: string;
  fen?: string;
};

function pgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of pgn.split(/\r?\n/)) {
    const match = line.match(/^\[([^\s]+)\s+"(.*)"\]$/);
    if (match) headers[match[1]] = match[2];
    else if (line.trim() && !line.startsWith("[")) break;
  }
  return headers;
}

function createChess(initialFen?: string): Chess {
  if (initialFen) {
    try {
      return new Chess(initialFen);
    } catch {
      // A malformed saved FEN must not prevent analysis of the remaining data.
    }
  }
  return new Chess();
}

function samePosition(left: string, right: string): boolean {
  // Full-move and half-move counters can differ between e-board snapshots.
  return left.split(" ").slice(0, 4).join(" ") === right.split(" ").slice(0, 4).join(" ");
}

function readPgnMoves(pgn?: string): MoveVerbose[] {
  if (!pgn?.trim()) return [];
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    return chess.history({ verbose: true }) as MoveVerbose[];
  } catch {
    return [];
  }
}

function readUciMoves(rawHistory: unknown, initialFen?: string): MoveVerbose[] {
  if (!Array.isArray(rawHistory) || rawHistory.length === 0) return [];
  const chess = createChess(initialFen);
  const moves: MoveVerbose[] = [];

  for (const raw of rawHistory) {
    const value = typeof raw === "string" ? raw.trim() : raw;
    try {
      let move: MoveVerbose | null = null;
      if (typeof value === "string") {
        const uci = value.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
        move = uci
          ? chess.move({ from: uci[1].toLowerCase(), to: uci[2].toLowerCase(), promotion: uci[3]?.toLowerCase() }) as MoveVerbose
          : chess.move(value) as MoveVerbose;
      } else if (value && typeof value === "object" && "from" in value && "to" in value) {
        const candidate = value as { from: string; to: string; promotion?: string | null };
        move = chess.move({ from: candidate.from, to: candidate.to, promotion: candidate.promotion ?? undefined }) as MoveVerbose;
      }
      if (!move) break;
      moves.push(move);
    } catch {
      // Preserve the valid prefix of a partial history rather than showing broken charts.
      break;
    }
  }

  return moves;
}

function recoverFenMoves(fenHistory: unknown, initialFen?: string): MoveVerbose[] {
  if (!Array.isArray(fenHistory) || fenHistory.length === 0) return [];
  const chess = createChess(initialFen);
  const moves: MoveVerbose[] = [];

  for (const nextFen of fenHistory) {
    if (typeof nextFen !== "string" || !nextFen.trim()) break;
    if (samePosition(chess.fen(), nextFen)) continue;

    const previousFen = chess.fen();
    const legalMoves = chess.moves({ verbose: true }) as MoveVerbose[];
    const found = legalMoves.find((candidate) => {
      const trial = new Chess(previousFen);
      trial.move({ from: candidate.from, to: candidate.to, promotion: candidate.promotion });
      return samePosition(trial.fen(), nextFen);
    });
    if (!found) break;

    chess.move({ from: found.from, to: found.to, promotion: found.promotion });
    moves.push(found);
  }

  return moves;
}

/** Reads the best available persisted history: PGN, then UCI, then e-board FEN snapshots. */
export function extractHistoryMoves(game: AnalysisGame): MoveVerbose[] {
  const pgn = game.pgn ?? "";
  const fromPgn = readPgnMoves(pgn);
  if (fromPgn.length) return fromPgn;

  const headers = pgnHeaders(pgn);
  const initialFen = headers.FEN || game.initialFen || game.startFen;
  const fromUci = readUciMoves(game.uciHistory, initialFen);
  if (fromUci.length) return fromUci;

  return recoverFenMoves(game.fenHistory, initialFen);
}

export function analyzeMatch(game: AnalysisGame, labels: AnalysisLabels) {
  const moves = extractHistoryMoves(game);
  const counters = { whiteCaptures: 0, blackCaptures: 0, whiteChecks: 0, blackChecks: 0, castles: 0, promotions: 0 };
  const byPiece: Record<PieceCode, { piece: string; whiteMoves: number; blackMoves: number }> = {
    p: { piece: labels.pieces.p, whiteMoves: 0, blackMoves: 0 },
    n: { piece: labels.pieces.n, whiteMoves: 0, blackMoves: 0 },
    b: { piece: labels.pieces.b, whiteMoves: 0, blackMoves: 0 },
    r: { piece: labels.pieces.r, whiteMoves: 0, blackMoves: 0 },
    q: { piece: labels.pieces.q, whiteMoves: 0, blackMoves: 0 },
    k: { piece: labels.pieces.k, whiteMoves: 0, blackMoves: 0 },
  };
  const timeline: Array<{ ply: number; whiteCaps: number; blackCaps: number }> = [];
  const distribution = { normal: 0, capture: 0, check: 0, castle: 0, promotion: 0 };

  moves.forEach((move, index) => {
    byPiece[move.piece][move.color === "w" ? "whiteMoves" : "blackMoves"] += 1;
    const isCapture = Boolean(move.captured) || /[ce]/.test(move.flags);
    // chess.js generates + / # only after validating the resulting board position.
    const isCheck = /[+#]$/.test(move.san);
    const isCastle = /[kq]/.test(move.flags);
    const isPromotion = Boolean(move.promotion) || move.flags.includes("p");

    if (isCapture) {
      if (move.color === "w") counters.whiteCaptures += 1;
      else counters.blackCaptures += 1;
    }
    if (isCheck) {
      if (move.color === "w") counters.whiteChecks += 1;
      else counters.blackChecks += 1;
    }
    if (isCastle) counters.castles += 1;
    if (isPromotion) counters.promotions += 1;

    // Distribution is intentionally exclusive, so the pie chart always totals total plies.
    if (isPromotion) distribution.promotion += 1;
    else if (isCastle) distribution.castle += 1;
    else if (isCapture) distribution.capture += 1;
    else if (isCheck) distribution.check += 1;
    else distribution.normal += 1;

    timeline.push({ ply: index + 1, whiteCaps: counters.whiteCaptures, blackCaps: counters.blackCaptures });
  });

  return {
    moves,
    counters,
    pieceActivity: Object.values(byPiece),
    timeline,
    typeDistribution: [
      { key: "normal", name: labels.moveTypes.normal, value: distribution.normal, color: "hsl(var(--muted-foreground))" },
      { key: "capture", name: labels.moveTypes.capture, value: distribution.capture, color: "hsl(var(--state-warning))" },
      { key: "check", name: labels.moveTypes.check, value: distribution.check, color: "hsl(var(--state-accent))" },
      { key: "castle", name: labels.moveTypes.castle, value: distribution.castle, color: "hsl(var(--state-success))" },
      { key: "promotion", name: labels.moveTypes.promotion, value: distribution.promotion, color: "hsl(var(--destructive))" },
    ].filter((entry) => entry.value > 0),
  };
}
