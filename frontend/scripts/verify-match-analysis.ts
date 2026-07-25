import assert from "node:assert/strict";
import { analyzeMatch, type AnalysisLabels } from "../lib/match-analysis.ts";

const labels: AnalysisLabels = {
  pieces: { p: "Pawn", n: "Knight", b: "Bishop", r: "Rook", q: "Queen", k: "King" },
  moveTypes: { normal: "Normal", capture: "Capture", check: "Check", castle: "Castle", promotion: "Promotion" },
};

function game(pgn: string, extras: Record<string, unknown> = {}) {
  return { pgn, ...extras } as never;
}

const normal = analyzeMatch(game("1. e4 e5 2. Qh5 Nc6 3. Qxe5+ Nxe5"), labels);
assert.equal(normal.moves.length, 6);
assert.equal(normal.counters.whiteCaptures, 1);
assert.equal(normal.counters.blackCaptures, 1);
assert.equal(normal.counters.whiteChecks, 1);
assert.equal(normal.timeline.at(-1)?.whiteCaps, 1);
assert.equal(normal.timeline.at(-1)?.blackCaps, 1);

const castling = analyzeMatch(game("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d3 O-O"), labels);
assert.equal(castling.counters.castles, 2);

const customFen = "8/P3k3/8/8/8/8/7p/4K3 w - - 0 1";
const promotion = analyzeMatch(game(`[SetUp "1"]\n[FEN "${customFen}"]\n\n1. a8=Q h1=Q+`), labels);
assert.equal(promotion.moves.length, 2);
assert.equal(promotion.counters.promotions, 2);

const uciFromFenHeader = analyzeMatch(game(`[SetUp "1"]\n[FEN "${customFen}"]`, { uciHistory: ["a7a8q", "h2h1q"] }), labels);
assert.equal(uciFromFenHeader.moves.length, 2);
assert.equal(uciFromFenHeader.counters.promotions, 2);

const empty = analyzeMatch(game(""), labels);
assert.equal(empty.moves.length, 0);
assert.equal(empty.timeline.length, 0);
assert.equal(empty.typeDistribution.length, 0);

console.log("Match-analysis verification passed: normal, castling, promotion, custom FEN, and empty history.");
