import { env } from "../config/environment.js";

interface RecoveryResponse {
  originalPgn?: unknown;
  steps?: unknown;
  bestMoveLists?: unknown;
  finalMoveLists?: unknown;
  fullyRecovered?: unknown;
  failedPlies?: unknown;
  longestRecoveredPly?: unknown;
}

export interface FenRecoveryResult {
  pgn: string;
  fullyRecovered: boolean;
  failedPlies: number[];
  longestRecoveredPly: number;
  steps?: unknown[];
  bestMoveLists?: unknown[];
  finalMoveLists?: unknown[];
}

interface RecoveryHeaders {
  Event?: string;
  Site?: string;
  Date?: string;
  Round?: string;
  White?: string;
  Black?: string;
  Result?: string;
  SetUp?: string;
  FEN?: string;
}

/**
 * Calls the optional Python recovery sidecar. A null result means the caller
 * should use its local custom PGN fallback.
 */
export async function recoverFenHistory(
  fenHistory: string[],
  startFen: string | undefined,
  headers: RecoveryHeaders,
  options: { includeSteps?: boolean } = {},
): Promise<FenRecoveryResult | null> {
  const baseUrl = env.RECOVER_SERVICE_URL?.trim().replace(/\/$/, "");
  if (!baseUrl || fenHistory.length === 0) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${baseUrl}/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fenHistory,
        startFen,
        headers,
        maxBranches: 2_000,
        finalOnly: options.includeSteps !== true,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`[FEN RECOVERY] Sidecar returned HTTP ${response.status}`);
      return null;
    }

    const data = await response.json() as RecoveryResponse;
    const pgn = typeof data.originalPgn === "string" ? data.originalPgn.trim() : "";
    if (!pgn) return null;
    const failedPlies = Array.isArray(data.failedPlies)
      ? data.failedPlies.filter((value): value is number => Number.isInteger(value))
      : [];
    return {
      pgn,
      fullyRecovered: data.fullyRecovered === true,
      failedPlies,
      longestRecoveredPly: typeof data.longestRecoveredPly === "number" ? data.longestRecoveredPly : 0,
      steps: options.includeSteps === true && Array.isArray(data.steps) ? data.steps : undefined,
      bestMoveLists: options.includeSteps === true && Array.isArray(data.bestMoveLists) ? data.bestMoveLists : undefined,
      finalMoveLists: options.includeSteps === true && Array.isArray(data.finalMoveLists) ? data.finalMoveLists : undefined,
    };
  } catch (error) {
    console.warn("[FEN RECOVERY] Sidecar unavailable; using local fallback", error instanceof Error ? error.message : error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function recoverFenHistoryToPgn(
  fenHistory: string[],
  startFen: string | undefined,
  headers: RecoveryHeaders,
): Promise<string | null> {
  const result = await recoverFenHistory(fenHistory, startFen, headers);
  return result?.pgn ?? null;
}
