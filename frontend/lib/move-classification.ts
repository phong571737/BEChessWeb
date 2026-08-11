import type { MoveClassification } from "@/lib/post-game-analysis";

/** Standard NAG symbols used by Lichess-style chess annotations. */
export const moveClassificationMark: Record<MoveClassification, string> = {
  brilliant: "!!",
  best: "!",
  excellent: "!",
  good: "!?",
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

/** Opaque, high-contrast tones for marks displayed over a board square. */
export const moveClassificationBoardTone: Record<MoveClassification, string> = {
  brilliant: "border-white/90 bg-info text-white",
  best: "border-white/90 bg-success text-black",
  excellent: "border-white/90 bg-success text-black",
  good: "border-white/90 bg-primary text-primary-foreground",
  inaccuracy: "border-white/90 bg-warning text-black",
  mistake: "border-white/90 bg-orange-600 text-white",
  blunder: "border-white/90 bg-destructive text-destructive-foreground",
  unavailable: "border-white/90 bg-muted-foreground text-background",
};
