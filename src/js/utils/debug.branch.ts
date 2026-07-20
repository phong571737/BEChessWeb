import { activeBranches } from "../game/game.repository.js";
import { Chess } from "chess.js";
import { Branch } from "../types/chess.types.js";

// debug
export function printBranches(gameID: string): void {
  const branches = activeBranches.get(gameID);

  if (!branches) {
    console.log(`[BRANCH] ${gameID}: no active branches`);
    return;
  }

  console.log(`\n========== BRANCH (${gameID}) ==========`);

  branches.forEach((b: Branch, i: number) => {
    console.log(`\n[BRANCH ${i}]`);
    console.log(`step:`, b.step);
    console.log(`fen:`, b.fen);
    console.log(`lastApplied:`, b.lastApplied);
    const uci = `${b.lastApplied.from}${b.lastApplied.to}${b.lastApplied.promotion ?? ""}`;
    console.log(`uci:`, uci);

    const temp = new Chess();
    temp.loadPgn(b.pgn);
    console.log(`pgn: ${temp.pgn()}`);
  });

  console.log(`\nTotal branches: ${branches.length}`);
  console.log(`===========================================\n`);
}