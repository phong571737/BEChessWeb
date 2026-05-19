import { activeBranches } from "../game/game.repository.js";
import { Chess } from "chess.js";

// debug
export function printBranches(gameID) {
  const branches = activeBranches.get(gameID);

  if (!branches) {
    console.log(`[BRANCH] ${gameID}: no active branches`);
    return;
  }

  console.log(`\n========== BRANCH (${gameID}) ==========`);

  branches.forEach((b, i) => {
    console.log(`\n[BRANCH ${i}]`);
    console.log(`step:`, b.step);
    console.log(`fen:`, b.fen);
    console.log(`lastApplied:`, b.lastApplied);
    console.log(`uci:`, b.lastApplied?.uci);

    const temp = new Chess();
    temp.loadPgn(b.pgn);
    console.log(`pgn: ${temp.pgn({ headers: false })}`);
  });

  console.log(`\nTotal branches: ${branches.length}`);
  console.log(`===========================================\n`);
}