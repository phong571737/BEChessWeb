/** A prefix view of V4's complete paths, never a recombination of independent moves. */
export interface RecoveryTreeLine {
  uciMoves: string[];
  sanMoves: string[];
  assumedFens: string[];
  startFen: string;
  pgn: string;
  movetext?: string;
  moveSources?: string[];
  steps?: { effectivePly?: number; originalPly?: number | null; synthetic?: boolean }[];
  groupId: string;
  rank: number;
  paddingIndices: number[];
  paddingScores: number[];
  scoreSides: string[];
}

export interface RecoveryTreeGroup {
  id: string;
  paddingIndices: number[];
  lineIndices: number[];
}

export function isTreeLine(value: unknown): value is RecoveryTreeLine {
  const line = value as RecoveryTreeLine | null;
  return !!line && typeof line.startFen === "string" && typeof line.pgn === "string"
    && typeof line.groupId === "string" && Array.isArray(line.uciMoves)
    && Array.isArray(line.sanMoves) && Array.isArray(line.assumedFens)
    && Array.isArray(line.paddingIndices) && Array.isArray(line.paddingScores)
    && Array.isArray(line.scoreSides);
}

export function treeGroups(lines: RecoveryTreeLine[]): RecoveryTreeGroup[] {
  const groups = new Map<string, RecoveryTreeGroup>();
  lines.forEach((line, index) => {
    if (!groups.has(line.groupId)) groups.set(line.groupId, { id: line.groupId, paddingIndices: line.paddingIndices, lineIndices: [] });
    groups.get(line.groupId)!.lineIndices.push(index);
  });
  return [...groups.values()].sort((a, b) => a.paddingIndices.length - b.paddingIndices.length);
}

function matchesPrefix(line: RecoveryTreeLine, selected: RecoveryTreeLine, end: number): boolean {
  if (end === 0) return true;
  return line.startFen === selected.startFen && selected.uciMoves.slice(0, end).every((move, i) => line.uciMoves[i] === move);
}

export function recoveryChoices(lines: RecoveryTreeLine[], selectedIndex: number, ply: number) {
  const selected = lines[selectedIndex];
  if (!selected) return [];
  const choices = new Map<string, { uci: string; san: string; score: number | null; side: string | null; lineIndices: number[] }>();
  lines.forEach((line, index) => {
    if (line.groupId !== selected.groupId || !matchesPrefix(line, selected, ply)) return;
    const uci = line.uciMoves[ply];
    if (!uci) return;
    const scoreIndex = line.paddingIndices.indexOf(ply);
    const score = scoreIndex < 0 ? null : line.paddingScores[scoreIndex] ?? null;
    const existing = choices.get(uci);
    if (existing) {
      existing.lineIndices.push(index);
    } else {
      choices.set(uci, { uci, san: line.sanMoves[ply], score,
        side: scoreIndex < 0 ? null : line.scoreSides[scoreIndex], lineIndices: [index] });
    }
  });
  return [...choices.values()].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
}

/** Preserve the compatible suffix as far as possible, then use V4 order for ties. */
export function chooseRecoveryLine(lines: RecoveryTreeLine[], selectedIndex: number, ply: number, uci: string): number {
  const selected = lines[selectedIndex];
  const candidates = recoveryChoices(lines, selectedIndex, ply).find(choice => choice.uci === uci)?.lineIndices ?? [];
  if (!selected || !candidates.length) return selectedIndex;
  let best = candidates[0], longest = -1;
  for (const index of candidates) {
    let length = 0;
    for (let i = ply + 1; i < selected.uciMoves.length && lines[index].uciMoves[i] === selected.uciMoves[i]; i++) length++;
    if (length > longest) { best = index; longest = length; }
  }
  return best;
}
