import { Chess, type Move } from "chess.js";
import { publicPath } from "@/lib/public-path";

export type MoveClassification = "best" | "brilliant" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder";

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
}

interface EngineScore {
  cp: number | null;
  mate: number | null;
  bestMove: string;
  depth: number;
}

function scoreAsCentipawns(score: EngineScore): number | null {
  if (score.mate !== null) return score.mate > 0 ? 100_000 : -100_000;
  return score.cp;
}

function uci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function classify(loss: number | null, played: string, best: string, brilliant: boolean): MoveClassification {
  if (played === best) return brilliant ? "brilliant" : "best";
  if (loss === null || loss <= 20) return "excellent";
  if (loss <= 50) return "good";
  if (loss <= 100) return "inaccuracy";
  if (loss <= 250) return "mistake";
  return "blunder";
}

/** A one-game, sequential UCI engine.  Scores are normalized to White's view. */
class PostGameEngine {
  private readonly worker: Worker;
  private ready: Promise<void>;
  private resolveSearch: ((result: EngineScore) => void) | null = null;
  private current: EngineScore = { cp: null, mate: null, bestMove: "", depth: 0 };

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
    if (info && /\bmultipv 1\b/.test(line)) {
      const depth = Number(info[1]);
      if (depth >= this.current.depth) {
        const score = Number(info[3]);
        this.current = {
          cp: info[2] === "cp" ? score : null,
          mate: info[2] === "mate" ? score : null,
          bestMove: this.current.bestMove,
          depth,
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
    this.current = { cp: null, mate: null, bestMove: "", depth: 0 };
    const result = await new Promise<EngineScore>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.resolveSearch = null;
        this.worker.postMessage("stop");
        reject(new Error("Engine search timed out"));
      }, 30_000);
      this.resolveSearch = (score) => {
        window.clearTimeout(timeout);
        resolve(score);
      };
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${depth}`);
    });
    return {
      ...result,
      cp: result.cp === null ? null : sideToMove === "b" ? -result.cp : result.cp,
      mate: result.mate === null ? null : sideToMove === "b" ? -result.mate : result.mate,
    };
  }

  dispose() {
    this.worker.postMessage("quit");
    this.worker.terminate();
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
  const engine = new PostGameEngine();
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
      });
      before = after;
      onProgress(index + 1, moves.length);
    }
    return analysis;
  } finally {
    engine.dispose();
  }
}
