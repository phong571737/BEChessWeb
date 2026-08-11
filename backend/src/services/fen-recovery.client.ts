import { env } from "../config/environment.js";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

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

const RECOVERY_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/**
 * Sends recovery requests without relying on global fetch. The Node build of
 * Stockfish Lite clears global fetch while initializing its WASM runtime, so
 * using the native HTTP modules keeps the recovery sidecar independent from
 * the chess engine's process-wide compatibility shim.
 */
function postRecovery(url: URL, payload: object): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;

      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(new Error("FEN recovery response is too large"));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => resolve({
        status: response.statusCode ?? 500,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });

    request.setTimeout(RECOVERY_TIMEOUT_MS, () => {
      request.destroy(new Error("FEN recovery request timed out"));
    });
    request.on("error", reject);
    request.end(body);
  });
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

  try {
    const response = await postRecovery(new URL(`${baseUrl}/recover`), {
        fenHistory,
        startFen,
        headers,
        maxBranches: 2_000,
        finalOnly: options.includeSteps !== true,
    });
    if (response.status < 200 || response.status >= 300) {
      console.warn(`[FEN RECOVERY] Sidecar returned HTTP ${response.status}`);
      return null;
    }

    const data = JSON.parse(response.body) as RecoveryResponse;
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
