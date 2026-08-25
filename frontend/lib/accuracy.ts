import { MoveAnalysis } from "./post-game-analysis";

type Side = "white" | "black";

export interface MoveAccuracyResult {
  ply: number;
  side: Side;
  accuracy: number | null;
}

export interface GameAccuracySummary {
  white: number | null;
  black: number | null;
  whiteAnalyzedMoves: number;
  blackAnalyzedMoves: number;
  moves: MoveAccuracyResult[];
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Convert a centipawn evaluation to expected White winning percentage. */
export function centipawnsToWinPercent(cp: number): number {
  const boundedCp = clamp(cp, -1000, 1000);
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * boundedCp)) - 1);
}

/** Calculate move accuracy from the moving side's perspective. */
function calculateMoveAccuracy(
  beforeCp: number,
  afterCp: number,
  color: "w" | "b",
): number {
  const whiteBefore = centipawnsToWinPercent(beforeCp);
  const whiteAfter = centipawnsToWinPercent(afterCp);
  const moverBefore = color === "w" ? whiteBefore : 100 - whiteBefore;
  const moverAfter = color === "w" ? whiteAfter : 100 - whiteAfter;
  const winPercentLoss = Math.max(0, moverBefore - moverAfter);

  return clamp(
    103.1668 * Math.exp(-0.04354 * winPercentLoss) - 3.1669,
    0,
    100,
  );
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    values.length;
  return Math.sqrt(variance);
}

function harmonicMean(values: number[]): number | null {
  if (values.length === 0) return null;
  if (values.some((value) => value <= 0)) return 0;
  return values.length / values.reduce((sum, value) => sum + 1 / value, 0);
}

function aggregateAccuracy(
  entries: Array<{ accuracy: number; weight: number }>,
): number | null {
  if (entries.length === 0) return null;
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const weightedMean =
    entries.reduce((sum, entry) => sum + entry.accuracy * entry.weight, 0) /
    totalWeight;
  const harmonic = harmonicMean(entries.map((entry) => entry.accuracy));
  if (harmonic === null) return null;
  return clamp((weightedMean + harmonic) / 2, 0, 100);
}

/** Calculate the project's previous Lichess-style accuracy for both sides. */
export function calculateGameAccuracy(
  moves: MoveAnalysis[],
): GameAccuracySummary {
  if (moves.length === 0) {
    return {
      white: null,
      black: null,
      whiteAnalyzedMoves: 0,
      blackAnalyzedMoves: 0,
      moves: [],
    };
  }

  const positionWinPercentages: Array<number | null> = [
    moves[0].evaluationBeforeCp === null
      ? null
      : centipawnsToWinPercent(moves[0].evaluationBeforeCp),
    ...moves.map((move) =>
      move.evaluationAfterCp === null
        ? null
        : centipawnsToWinPercent(move.evaluationAfterCp),
    ),
  ];

  const windowSize = clamp(Math.floor(moves.length / 10), 2, 8);
  const weights = moves.map((_, index) => {
    const start = Math.max(
      0,
      Math.min(index, positionWinPercentages.length - windowSize),
    );
    const values = positionWinPercentages
      .slice(start, start + windowSize)
      .filter((value): value is number => value !== null);
    return clamp(standardDeviation(values), 0.5, 12);
  });

  const moveResults: MoveAccuracyResult[] = moves.map((move) => {
    const color = move.color ?? (move.ply % 2 === 1 ? "w" : "b");
    const side: Side = color === "w" ? "white" : "black";
    if (move.evaluationBeforeCp === null || move.evaluationAfterCp === null) {
      return { ply: move.ply, side, accuracy: null };
    }
    return {
      ply: move.ply,
      side,
      accuracy: calculateMoveAccuracy(
        move.evaluationBeforeCp,
        move.evaluationAfterCp,
        color,
      ),
    };
  });

  const collectSide = (side: Side) =>
    moveResults.flatMap((move, index) =>
      move.side === side && move.accuracy !== null
        ? [{ accuracy: move.accuracy, weight: weights[index] }]
        : [],
    );
  const whiteEntries = collectSide("white");
  const blackEntries = collectSide("black");

  return {
    white: aggregateAccuracy(whiteEntries),
    black: aggregateAccuracy(blackEntries),
    whiteAnalyzedMoves: whiteEntries.length,
    blackAnalyzedMoves: blackEntries.length,
    moves: moveResults,
  };
}
