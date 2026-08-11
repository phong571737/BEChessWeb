import type { MoveClassification } from "@/lib/post-game-analysis";

/** Standard chess annotation glyphs used beside Stockfish move labels. */
export const moveClassificationSymbol: Record<MoveClassification, string> = {
  brilliant: "!!",
  best: "★",
  excellent: "!",
  good: "✓",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
  unavailable: "—",
};

/** Shared semantic color treatment for Stockfish move classifications. */
export const moveClassificationTone: Record<MoveClassification, string> = {
  brilliant: "border-accent/40 bg-accent text-accent-foreground",
  best: "border-success/40 bg-success/10 text-success",
  excellent: "border-info/40 bg-info/10 text-info",
  good: "border-border bg-muted text-foreground",
  inaccuracy: "border-warning/40 bg-warning/10 text-warning",
  mistake: "border-warning/60 bg-warning/15 text-warning",
  blunder: "border-destructive/40 bg-destructive/10 text-destructive",
  unavailable: "border-border bg-muted text-muted-foreground",
};
