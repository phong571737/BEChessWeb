import { apiFetch } from "@/lib/api-fetch";
import type { HistoryGame } from "@/types/game.types";

export interface RecoveryPayload {
  pgn?: unknown;
  bestPgn?: unknown;
  fenHistory?: unknown;
  rawFenHistory?: unknown;
  fenHistoryEdited?: unknown;
  preferredFenHistory?: unknown;
  bestMoveLists?: unknown;
  steps?: unknown;
  preprocessing?: unknown;
}

export async function fetchRecoveredPgn(gameId: string, debugRecovery = false): Promise<RecoveryPayload> {
  const query = debugRecovery ? "?debugRecovery=1" : "";
  const response = await fetch(`/games/history/${encodeURIComponent(gameId)}/recovered-pgn${query}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { code?: unknown } | null;
    if (body?.code === "RECOVERY_BRANCH_LIMIT") throw new Error("branch_limit");
    if (body?.code === "RECOVERY_TIMEOUT") throw new Error("timeout");
    if (response.status === 503) throw new Error("unavailable");
    throw new Error("failed");
  }
  return response.json() as Promise<RecoveryPayload>;
}

type FenHistoryResponse = { fenHistoryEdited?: unknown; code?: unknown; index?: unknown };

async function readFenHistoryResponse(response: Response, includeIndex = false): Promise<string[]> {
  const body = await response.json().catch(() => null) as FenHistoryResponse | null;
  if (!response.ok || !Array.isArray(body?.fenHistoryEdited)) {
    if (body?.code === "INVALID_FEN") {
      const suffix = includeIndex && Number.isInteger(body.index) ? `:${Number(body.index) + 1}` : "";
      throw new Error(`invalid_fen${suffix}`);
    }
    throw new Error("save_failed");
  }
  return body.fenHistoryEdited.filter((fen): fen is string => typeof fen === "string");
}

export async function saveFenSnapshot(gameId: string, fen: string, index?: number): Promise<string[]> {
  const editing = index !== undefined;
  const endpoint = editing
    ? `/games/history/${encodeURIComponent(gameId)}/fens/${index}`
    : `/games/history/${encodeURIComponent(gameId)}/fens`;
  const response = await apiFetch(endpoint, {
    method: editing ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fen }),
  });
  return readFenHistoryResponse(response);
}

export async function insertFenSnapshot(gameId: string, fen: string, afterIndex: number): Promise<string[]> {
  const response = await apiFetch(`/games/history/${encodeURIComponent(gameId)}/fens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fen, afterIndex }),
  });
  return readFenHistoryResponse(response);
}

export async function replaceFenHistory(gameId: string, fenHistory: string[]): Promise<string[]> {
  const response = await apiFetch(`/games/history/${encodeURIComponent(gameId)}/fens`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fenHistory }),
  });
  return readFenHistoryResponse(response, true);
}

export async function saveHistoryTraces(game: HistoryGame, pgn: string): Promise<HistoryGame> {
  const response = await apiFetch(`/games/history/${encodeURIComponent(game._id)}/traces`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pgn }),
  });
  const body = await response.json().catch(() => null) as { success?: boolean; pgn?: unknown; uciHistory?: unknown } | null;
  if (!response.ok || body?.success !== true) throw new Error("save_failed");
  return {
    ...game,
    ...(typeof body.pgn === "string" ? { pgn: body.pgn } : {}),
    ...(Array.isArray(body.uciHistory) ? { uciHistory: body.uciHistory.filter((value): value is string => typeof value === "string") } : {}),
    analysis: undefined,
  };
}
