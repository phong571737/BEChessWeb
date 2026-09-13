import assert from "node:assert/strict";
import { chooseRecoveryLine, recoveryChoices, treeGroups, type RecoveryTreeLine } from "../lib/recovery-tree.ts";

function line(groupId: string, moves: string[], scores: number[], padding = [0, 1]): RecoveryTreeLine {
  return { groupId, uciMoves: moves, sanMoves: moves, paddingIndices: padding, paddingScores: scores,
    scoreSides: padding.map(() => "w"), rank: 1, startFen: "same-start", pgn: "*", assumedFens: [] };
}
const lines = [
  line("two", ["a", "b", "c"], [42, -20]),
  line("two", ["a", "d", "e"], [42, 30]),
  line("two", ["f", "g", "h"], [35, 80]),
  line("one", ["a", "z", "c"], [99], [1]),
];
assert.equal(treeGroups(lines)[0].id, "one", "fewest padding first");
assert.deepEqual(recoveryChoices(lines, 0, 0).map(c => c.uci), ["a", "f"]);
assert.deepEqual(recoveryChoices(lines, 0, 1).map(c => c.uci), ["d", "b"], "mover score orders suggestions");
assert.equal(chooseRecoveryLine(lines, 0, 1, "b"), 0, "lower-scored legal move remains selectable");
assert.equal(chooseRecoveryLine(lines, 0, 1, "g"), 0, "cannot splice an incompatible branch");
assert.equal(chooseRecoveryLine(lines, 0, 1, "z"), 0, "cannot splice across groups");
const switched = chooseRecoveryLine(lines, 0, 0, "f");
assert.equal(switched, 2);
assert.deepEqual(recoveryChoices(lines, switched, 1).map(c => c.uci), ["g"]);
assert.equal(chooseRecoveryLine(lines, 1, 0, "a"), 1, "keep a compatible previously chosen suffix");
assert.equal(recoveryChoices(lines, 99, 0).length, 0);
const differentStart = { ...line("two", ["q", "r"], [1, 2]), startFen: "other-turn" };
assert.equal(recoveryChoices([...lines, differentStart], 0, 0).length, 3, "all initial-turn alternatives remain selectable at root");
console.log("Recovery tree: grouping, score order, legal prefix selection and suffix retention passed.");
