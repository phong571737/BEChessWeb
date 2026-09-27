import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import { publicPath } from "@/lib/public-path";

export type MoveClassification = "best" | "brilliant" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder" | "unavailable";

// A complete game analysis runs one search per position. Keep each search
// bounded so a single tactical position cannot discard the entire batch.
const SEARCH_TIME_MS = 1_000;
const SEARCH_TIMEOUT_MS = 5_000;

export interface MoveAnalysis {
  ply: number;
  color?: "w" | "b";
  san: string;
  uci: string;
  bestMove: string;
  evaluationBeforeCp: number | null;
  evaluationAfterCp: number | null;
  centipawnLoss: number | null;
  classification: MoveClassification;
  depth: number;
  principalVariation: string[];
}

interface HistoryAnalysisSource {
  fenHistory?: string[];
}

interface EngineScore {
  cp: number | null;
  mate: number | null;
  bestMove: string;
  depth: number;
  principalVariation: string[];
}

function scoreAsCentipawns(score: EngineScore): number | null {
  if (score.mate !== null) return score.mate > 0 ? 100_000 : -100_000;
  return score.cp;
}

type InferredMove = Pick<Move, "from" | "to" | "promotion" | "color" | "piece" | "san">;

function uci(move: Pick<Move, "from" | "to" | "promotion">): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function classify(loss: number | null, played: string, best: string, brilliant: boolean): MoveClassification {
  if (!played || !best || loss === null) return "unavailable";
  if (played === best) return brilliant ? "brilliant" : "best";
  if (loss <= 20) return "excellent";
  if (loss <= 50) return "good";
  if (loss <= 100) return "inaccuracy";
  if (loss <= 250) return "mistake";
  return "blunder";
}

function emptyScore(): EngineScore {
  return { cp: null, mate: null, bestMove: "", depth: 0, principalVariation: [] };
}

/** Returns a standard FEN suitable for Stockfish, or null for a device snapshot it cannot analyze. */
function engineFen(fen: string): string | null {
  try {
    return new Chess(fen, { skipValidation: true }).fen();
  } catch {
    return null;
  }
}

/** A one-game, sequential UCI engine.  Scores are normalized to White's view. */
class PostGameEngine {
  private readonly worker: Worker;
  private ready: Promise<void>;
  private resolveSearch: ((result: EngineScore) => void) | null = null;
  private current: EngineScore = emptyScore();

  constructor() {
    this.worker = new Worker(publicPath("/stockfish/stockfish-18-lite-single.js"));
    this.ready = new Promise((resolve, reject) => {
      const startupTimeout = window.setTimeout(() => reject(new Error("Engine startup timed out")), 15_000);
      this.worker.onerror = () => reject(new Error("Engine worker failed"));
      this.worker.onmessage = ({ data }) => {
        const line = String(data);
        if (line.includes("readyok")) {
          window.clearTimeout(startupTimeout);
          resolve();
          return;
        }
        this.handleLine(line);
      };
      this.worker.postMessage("uci");
      this.worker.postMessage("ucinewgame");
      this.worker.postMessage("isready");
    });
  }

  private handleLine(line: string) {
    const info = line.match(/\binfo\b.*\bdepth (\d+).*\bscore (cp|mate) (-?\d+)/);
    const multiPv = line.match(/\bmultipv (\d+)/);
    if (info && (!multiPv || Number(multiPv[1]) === 1)) {
      const depth = Number(info[1]);
      if (depth >= this.current.depth) {
        const score = Number(info[3]);
        const variation = line.match(/\bpv\s+(.+)$/)?.[1]?.trim().split(/\s+/).slice(0, 8) ?? [];
        this.current = {
          cp: info[2] === "cp" ? score : null,
          mate: info[2] === "mate" ? score : null,
          bestMove: this.current.bestMove,
          depth,
          principalVariation: variation,
        };
      }
      return;
    }
    const best = line.match(/^bestmove\s+([^\s]+)/);
    if (best && this.resolveSearch) {
      const resolve = this.resolveSearch;
      this.resolveSearch = null;
      resolve({ ...this.current, bestMove: best[1] === "(none)" ? "" : best[1] });
    }
  }

  async evaluate(fen: string, depth: number): Promise<EngineScore> {
    await this.ready;
    const sideToMove = fen.split(" ")[1] ?? "w";
    this.current = emptyScore();
    const result = await new Promise<EngineScore>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.resolveSearch = null;
        this.worker.postMessage("stop");
        reject(new Error("Engine search timed out"));
      }, SEARCH_TIMEOUT_MS);
      this.resolveSearch = (score) => {
        window.clearTimeout(timeout);
        resolve(score);
      };
      this.worker.postMessage(`position fen ${fen}`);
      // Stockfish stops at whichever limit is reached first. Depth remains a
      // quality ceiling while movetime guarantees that long tactical lines do
      // not stall or abort analysis of the remaining moves.
      this.worker.postMessage(`go depth ${depth} movetime ${SEARCH_TIME_MS}`);
    });
    return {
      ...result,
      cp: result.cp === null ? null : sideToMove === "b" ? -result.cp : result.cp,
      mate: result.mate === null ? null : sideToMove === "b" ? -result.mate : result.mate,
    };
  }

  dispose() {
    try { this.worker.postMessage("quit"); } catch { /* Worker may already have failed. */ }
    this.worker.terminate();
  }
}

/**
 * Keeps a malformed e-board snapshot or a transient worker failure local to
 * that position. A fresh worker is retried once, then the move is saved as
 * unavailable instead of aborting analysis of the entire game.
 */
class ResilientPostGameEngine {
  private engine: PostGameEngine | null = null;

  async evaluate(fen: string, depth: number): Promise<EngineScore> {
    const normalizedFen = engineFen(fen);
    if (!normalizedFen) return emptyScore();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      this.engine ??= new PostGameEngine();
      try {
        return await this.engine.evaluate(normalizedFen, attempt === 0 ? depth : Math.min(depth, 10));
      } catch (error) {
        console.warn("Post-game engine evaluation failed", error);
        this.engine.dispose();
        this.engine = null;
      }
    }
    return emptyScore();
  }

  dispose() {
    this.engine?.dispose();
    this.engine = null;
  }
}

function initialGame(pgn: string): Chess {
  const headers = new Chess();
  headers.loadPgn(pgn);
  const fen = headers.getHeaders().FEN;
  return fen ? new Chess(fen) : new Chess();
}

/**
 * Replays legal PGN moves and evaluates the position before and after each
 * ply. This intentionally runs on demand: it never changes a live game.
 */
export async function analyzePgnMoves(
  pgn: string,
  onProgress: (completed: number, total: number) => void,
  depth = 14,
  signal?: AbortSignal,
): Promise<MoveAnalysis[]> {
  signal?.throwIfAborted();
  const parsed = new Chess();
  parsed.loadPgn(pgn);
  const moves = parsed.history({ verbose: true });
  if (!moves.length) return [];

  const replay = initialGame(pgn);
  const engine = new ResilientPostGameEngine();
  const analysis: MoveAnalysis[] = [];
  try {
    let before = await engine.evaluate(replay.fen(), depth);
    for (const [index, move] of moves.entries()) {
      signal?.throwIfAborted();
      const played = uci(move);
      const pieceValue = ({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 } as Record<string, number>)[move.piece] ?? 0;
      replay.move({ from: move.from, to: move.to, promotion: move.promotion });
      const after = await engine.evaluate(replay.fen(), depth);
      signal?.throwIfAborted();
      const beforeCp = scoreAsCentipawns(before);
      const afterCp = scoreAsCentipawns(after);
      const loss = beforeCp === null || afterCp === null
        ? null
        : Math.max(0, move.color === "w" ? beforeCp - afterCp : afterCp - beforeCp);
      const opponentCanCaptureMovedPiece = replay.moves({ verbose: true }).some((candidate) => candidate.to === move.to && Boolean(candidate.captured));
      const brilliant = played === before.bestMove && pieceValue >= 3 && opponentCanCaptureMovedPiece && Math.abs(afterCp ?? 0) >= 80;
      analysis.push({
        ply: index + 1,
        color: move.color,
        san: move.san,
        uci: played,
        bestMove: before.bestMove,
        evaluationBeforeCp: beforeCp,
        evaluationAfterCp: afterCp,
        centipawnLoss: loss,
        classification: classify(loss, played, before.bestMove, brilliant),
        depth: Math.min(before.depth, after.depth),
        principalVariation: before.principalVariation,
      });
      before = after;
      onProgress(index + 1, moves.length);
    }
    return analysis;
  } finally {
    engine.dispose();
  }
}

const DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Returns only the board layout so unreliable device FEN clocks do not affect move matching. */
function fenPlacement(fen: string): string {
  return fen.trim().split(/\s+/)[0] ?? "";
}

function fenTurn(fen: string): "w" | "b" | null {
  const turn = fen.trim().split(/\s+/)[1];
  return turn === "w" || turn === "b" ? turn : null;
}

/** Replaces only the active-color field while preserving the recorded position metadata. */
function fenWithTurn(fen: string, turn: "w" | "b"): string {
  const fields = fen.trim().split(/\s+/);
  return [
    fields[0] ?? "8/8/8/8/8/8/8/8",
    turn,
    fields[2] || "-",
    fields[3] || "-",
    fields[4] || "0",
    fields[5] || "1",
  ].join(" ");
}

/**
 * Reconstructs the legal move that transforms one persisted board position
 * into the next. The FEN timeline is the only source of truth. Device UCI is
 * deliberately ignored so stale or shifted UCI entries cannot corrupt rows.
 */
function inferMoveFromFenTransition(beforeFen: string, afterFen: string): InferredMove | null {
  const expectedPlacement = fenPlacement(afterFen);
  if (!expectedPlacement || expectedPlacement === fenPlacement(beforeFen)) return null;

  const recordedBeforeTurn = fenTurn(beforeFen);
  const recordedAfterTurn = fenTurn(afterFen);
  const moverFromAfter = recordedAfterTurn === "w" ? "b" : recordedAfterTurn === "b" ? "w" : null;
  const candidateTurns = Array.from(new Set(
    [recordedBeforeTurn, moverFromAfter].filter((turn): turn is "w" | "b" => turn !== null),
  ));

  for (const turn of candidateTurns) {
    try {
      const position = new Chess(fenWithTurn(beforeFen, turn), { skipValidation: true });
      const matches: Move[] = [];

      for (const candidate of position.moves({ verbose: true })) {
        const applied = position.move({
          from: candidate.from,
          to: candidate.to,
          promotion: candidate.promotion,
        });
        const matchesSnapshot = fenPlacement(position.fen()) === expectedPlacement;
        position.undo();
        if (applied && matchesSnapshot) matches.push(applied);
      }

      if (matches.length === 1) return matches[0];
    } catch {
      // Try the other turn derived from the adjacent FEN snapshot.
    }
  }

  return inferMoveFromPlacementDiff(beforeFen, afterFen);
}

/** Expands the piece-placement field into a square-to-piece map. */
function fenBoard(fen: string): Map<string, string> | null {
  const ranks = fenPlacement(fen).split("/");
  if (ranks.length !== 8) return null;
  const board = new Map<string, string>();
  for (const [rankIndex, encodedRank] of ranks.entries()) {
    let fileIndex = 0;
    for (const token of encodedRank) {
      if (/\d/.test(token)) {
        fileIndex += Number(token);
        continue;
      }
      if (fileIndex >= 8) return null;
      board.set(`${"abcdefgh"[fileIndex]}${8 - rankIndex}`, token);
      fileIndex += 1;
    }
    if (fileIndex !== 8) return null;
  }
  return board;
}

function pieceColor(piece: string): "w" | "b" {
  return piece === piece.toUpperCase() ? "w" : "b";
}

function sameBoard(left: Map<string, string>, right: Map<string, string>): boolean {
  const squares = new Set([...left.keys(), ...right.keys()]);
  return [...squares].every((square) => left.get(square) === right.get(square));
}

/**
 * Falls back to the physical board delta when chess.js cannot replay the
 * transition because device metadata (turn/castling/check state) is stale.
 * This still uses only the two adjacent FEN snapshots.
 */
function inferMoveFromPlacementDiff(beforeFen: string, afterFen: string): InferredMove | null {
  const before = fenBoard(beforeFen);
  const after = fenBoard(afterFen);
  if (!before || !after) return null;

  const changedSquares = new Set([...before.keys(), ...after.keys()].filter(
    (square) => before.get(square) !== after.get(square),
  ));
  const matches: InferredMove[] = [];

  for (const color of ["w", "b"] as const) {
    const fromSquares = [...changedSquares].filter((square) => {
      const piece = before.get(square);
      return piece && pieceColor(piece) === color;
    });
    const toSquares = [...changedSquares].filter((square) => {
      const piece = after.get(square);
      return piece && pieceColor(piece) === color;
    });

    for (const from of fromSquares) {
      const beforePiece = before.get(from)!;
      for (const to of toSquares) {
        if (from === to) continue;
        const afterPiece = after.get(to)!;
        const piece = beforePiece.toLowerCase();
        const promoted = piece === "p" && afterPiece.toLowerCase() !== "p";
        if (!promoted && afterPiece.toLowerCase() !== piece) continue;

        const simulated = new Map(before);
        const captured = simulated.get(to);
        simulated.delete(from);

        const fromFile = from.charCodeAt(0) - 97;
        const toFile = to.charCodeAt(0) - 97;
        const fromRank = from[1];
        if (piece === "k" && fromRank === to[1] && Math.abs(toFile - fromFile) === 2) {
          const kingSide = toFile > fromFile;
          const rookFrom = `${kingSide ? "h" : "a"}${fromRank}`;
          const rookTo = `${kingSide ? "f" : "d"}${fromRank}`;
          const rook = simulated.get(rookFrom);
          simulated.delete(rookFrom);
          if (rook) simulated.set(rookTo, rook);
        }

        if (piece === "p" && fromFile !== toFile && !captured) {
          simulated.delete(`${to[0]}${fromRank}`);
        }
        simulated.set(to, afterPiece);
        if (!sameBoard(simulated, after)) continue;

        const promotion = promoted ? afterPiece.toLowerCase() : undefined;
        const captureMark = captured || (piece === "p" && fromFile !== toFile) ? "x" : "";
        const pieceMark = piece === "p" ? (captureMark ? from[0] : "") : piece.toUpperCase();
        const castle = piece === "k" && Math.abs(toFile - fromFile) === 2
          ? (toFile > fromFile ? "O-O" : "O-O-O")
          : null;
        matches.push({
          from: from as Square,
          to: to as Square,
          promotion: promotion as PieceSymbol | undefined,
          color,
          piece: piece as Move["piece"],
          san: castle ?? `${pieceMark}${captureMark}${to}${promotion ? `=${promotion.toUpperCase()}` : ""}`,
        });
      }
    }
  }

  return matches.length === 1 ? matches[0] : null;
}

/**
 * Analyzes only adjacent snapshots from the selected FEN timeline. UCI and
 * PGN are deliberately ignored so they cannot shift or override the source.
 */
export async function analyzeHistoryMoves(
  game: HistoryAnalysisSource,
  onProgress: (completed: number, total: number) => void,
  depth = 14,
  signal?: AbortSignal,
): Promise<MoveAnalysis[]> {
  signal?.throwIfAborted();
  const fens = game.fenHistory?.filter((fen) => typeof fen === "string" && fen.trim()) ?? [];
  if (fens.length < 2) return [];

  const engine = new ResilientPostGameEngine();
  const output: MoveAnalysis[] = [];
  try {
    let beforeFen = fens[0];
    let before = await engine.evaluate(beforeFen, depth);
    for (let index = 1; index < fens.length; index += 1) {
      const afterFen = fens[index];
      signal?.throwIfAborted();
      const move = inferMoveFromFenTransition(beforeFen, afterFen);
      let position: Chess | null = null;
      try { position = new Chess(beforeFen, { skipValidation: true }); } catch { position = null; }
      if (move && position) {
        try {
          position.move({ from: move.from, to: move.to, promotion: move.promotion });
        } catch {
          position = null;
        }
      }
      const played = move ? uci(move) : "";
      const after = await engine.evaluate(afterFen, depth);
      signal?.throwIfAborted();
      const beforeCp = scoreAsCentipawns(before);
      const afterCp = scoreAsCentipawns(after);
      const side = move?.color ?? (beforeFen.split(" ")[1] ?? "w");
      const loss = beforeCp === null || afterCp === null ? null : Math.max(0, side === "w" ? beforeCp - afterCp : afterCp - beforeCp);
      const pieceValue = move ? ({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 } as Record<string, number>)[move.piece] ?? 0 : 0;
      const opponentCanCaptureMovedPiece = move !== null && position !== null
        ? position.moves({ verbose: true }).some((candidate) => candidate.to === move.to && Boolean(candidate.captured))
        : false;
      const brilliant = played === before.bestMove && pieceValue >= 3 && opponentCanCaptureMovedPiece && Math.abs(afterCp ?? 0) >= 80;
      output.push({
        ply: index,
        color: side === "b" ? "b" : "w",
        san: move?.san ?? (played || "?"),
        uci: played || "?",
        bestMove: before.bestMove,
        evaluationBeforeCp: beforeCp,
        evaluationAfterCp: afterCp,
        centipawnLoss: loss,
        classification: classify(loss, played, before.bestMove, brilliant),
        depth: Math.min(before.depth, after.depth),
        principalVariation: before.principalVariation,
      });
      beforeFen = afterFen;
      before = after;
      onProgress(index, fens.length - 1);
    }
    return output;
  } finally {
    engine.dispose();
  }
}
