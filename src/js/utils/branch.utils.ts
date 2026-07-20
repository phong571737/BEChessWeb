import { Branch } from "../types/chess.types.js";
import { formatUCI } from "./chess.utils.js";

export function serializeBranches(branches: Branch[]) {
  return branches.map((b) => ({
    id: b.id,
    fen: b.fen,
    pgn: b.pgn,
    lastMove: b.lastApplied
      ? {
          from: b.lastApplied.from,
          to: b.lastApplied.to,
          promotion: b.lastApplied.promotion ?? null,
          uci: formatUCI(b.lastApplied.from, b.lastApplied.to, b.lastApplied.promotion),
        }
      : null,
    step: b.step,
    parentId: b.parentId ?? null,
  }));
}