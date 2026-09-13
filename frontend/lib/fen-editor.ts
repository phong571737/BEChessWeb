export type FenEditorPiece = "wP" | "wN" | "wB" | "wR" | "wQ" | "wK" | "bP" | "bN" | "bB" | "bR" | "bQ" | "bK";

export const FEN_EDITOR_PIECES: Record<FenEditorPiece, { symbol: string; fen: string; name: "piece.pawn" | "piece.knight" | "piece.bishop" | "piece.rook" | "piece.queen" | "piece.king" }> = {
  wP: { symbol: "♙", fen: "P", name: "piece.pawn" }, wN: { symbol: "♘", fen: "N", name: "piece.knight" },
  wB: { symbol: "♗", fen: "B", name: "piece.bishop" }, wR: { symbol: "♖", fen: "R", name: "piece.rook" },
  wQ: { symbol: "♕", fen: "Q", name: "piece.queen" }, wK: { symbol: "♔", fen: "K", name: "piece.king" },
  bP: { symbol: "♟", fen: "p", name: "piece.pawn" }, bN: { symbol: "♞", fen: "n", name: "piece.knight" },
  bB: { symbol: "♝", fen: "b", name: "piece.bishop" }, bR: { symbol: "♜", fen: "r", name: "piece.rook" },
  bQ: { symbol: "♛", fen: "q", name: "piece.queen" }, bK: { symbol: "♚", fen: "k", name: "piece.king" },
};

export const EDITOR_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
export const EDITOR_RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

export function fenEditorPosition(fen: string): Record<string, FenEditorPiece> {
  const position: Record<string, FenEditorPiece> = {};
  const ranks = (fen.trim().split(/\s+/)[0] ?? "").split("/");
  ranks.forEach((rank, rankIndex) => {
    let fileIndex = 0;
    for (const value of rank) {
      if (/^[1-8]$/.test(value)) { fileIndex += Number(value); continue; }
      const piece = Object.entries(FEN_EDITOR_PIECES).find(([, item]) => item.fen === value)?.[0] as FenEditorPiece | undefined;
      if (piece && fileIndex < 8) position[`${EDITOR_FILES[fileIndex]}${8 - rankIndex}`] = piece;
      fileIndex += 1;
    }
  });
  return position;
}

export function fenWithEditorPosition(fen: string, position: Record<string, FenEditorPiece>): string {
  const placement = EDITOR_RANKS.map((rank) => {
    let empty = 0;
    let text = "";
    for (const file of EDITOR_FILES) {
      const piece = position[`${file}${rank}`];
      if (!piece) { empty += 1; continue; }
      if (empty) text += String(empty);
      empty = 0;
      text += FEN_EDITOR_PIECES[piece].fen;
    }
    return `${text}${empty || ""}` || "8";
  }).join("/");
  const fields = fen.trim().split(/\s+/);
  return [placement, fields[1] === "b" ? "b" : "w", fields[2] || "-", fields[3] || "-", fields[4] || "0", fields[5] || "1"].join(" ");
}
