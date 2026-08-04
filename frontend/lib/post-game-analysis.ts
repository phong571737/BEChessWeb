import { Chess, type Move } from "chess.js";
import { publicPath } from "@/lib/public-path";

export type MoveClassification = "best" | "brilliant" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder" | "unavailable";

// A complete game analysis runs one search per position. Keep each search
// bounded so a single tactical position cannot discard the entire batch.
const SEARCH_TIME_MS = 1_000;
const SEARCH_TIMEOUT_MS = 5_000;

export interface MoveAnalysis {
  ply: number;
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
  pgn?: string;
  initialFen?: string;
  fenHistory?: string[];
  uciHistory?: string[];
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

function uci(move: Move): string {
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
    return new Chess(fen).fen();
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
): Promise<MoveAnalysis[]> {
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
      const played = uci(move);
      const pieceValue = ({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 } as Record<string, number>)[move.piece] ?? 0;
      replay.move({ from: move.from, to: move.to, promotion: move.promotion });
      const after = await engine.evaluate(replay.fen(), depth);
      const beforeCp = scoreAsCentipawns(before);
      const afterCp = scoreAsCentipawns(after);
      const loss = beforeCp === null || afterCp === null
        ? null
        : Math.max(0, move.color === "w" ? beforeCp - afterCp : afterCp - beforeCp);
      const opponentCanCaptureMovedPiece = replay.moves({ verbose: true }).some((candidate) => candidate.to === move.to && Boolean(candidate.captured));
      const brilliant = played === before.bestMove && pieceValue >= 3 && opponentCanCaptureMovedPiece && Math.abs(afterCp ?? 0) >= 80;
      analysis.push({
        ply: index + 1,
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

function parseUci(token: string | undefined): { from: string; to: string; promotion?: "q" | "r" | "b" | "n" } | null {
  const match = token?.trim().match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
  if (!match) return null;
  return { from: match[1].toLowerCase(), to: match[2].toLowerCase(), promotion: match[3]?.toLowerCase() as "q" | "r" | "b" | "n" | undefined };
}

/**
 * Analyzes the durable e-board history directly. FEN snapshots take priority
 * over PGN because older devices may have stored incomplete PGN notation.
 */
export async function analyzeHistoryMoves(
  game: HistoryAnalysisSource,
  onProgress: (completed: number, total: number) => void,
  depth = 14,
): Promise<MoveAnalysis[]> {
  const fens = game.fenHistory?.filter((fen) => typeof fen === "string" && fen.trim()) ?? [];
  if (!fens.length) return analyzePgnMoves(game.pgn ?? "", onProgress, depth);

  const engine = new ResilientPostGameEngine();
  const output: MoveAnalysis[] = [];
  try {
    let beforeFen = game.initialFen || DEFAULT_FEN;
    let before = await engine.evaluate(beforeFen, depth);
    for (const [index, afterFen] of fens.entries()) {
      const token = parseUci(game.uciHistory?.[index]);
      let position: Chess | null = null;
      try { position = new Chess(beforeFen, { skipValidation: true }); } catch { position = null; }
      let move: Move | null = null;
      if (token && position) {
        try { move = position.move(token); } catch { move = null; }
      }
      const played = token ? `${token.from}${token.to}${token.promotion ?? ""}` : "";
      const after = await engine.evaluate(afterFen, depth);
      const beforeCp = scoreAsCentipawns(before);
      const afterCp = scoreAsCentipawns(after);
      const side = beforeFen.split(" ")[1] ?? "w";
      const loss = beforeCp === null || afterCp === null ? null : Math.max(0, side === "w" ? beforeCp - afterCp : afterCp - beforeCp);
      const pieceValue = move ? ({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 } as Record<string, number>)[move.piece] ?? 0 : 0;
      const opponentCanCaptureMovedPiece = move !== null && position !== null
        ? position.moves({ verbose: true }).some((candidate) => candidate.to === move.to && Boolean(candidate.captured))
        : false;
      const brilliant = played === before.bestMove && pieceValue >= 3 && opponentCanCaptureMovedPiece && Math.abs(afterCp ?? 0) >= 80;
      output.push({
        ply: index + 1,
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
      onProgress(index + 1, fens.length);
    }
    return output;
  } finally {
    engine.dispose();
  }
}
