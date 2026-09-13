import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { env } from "../config/environment.js";

interface RecoveryLine {
  uciMoves: string[];
  sanMoves: string[];
  moveSources: string[];
  assumedFens: string[];
  movetext: string;
  pgn: string;
  startFen: string;
  groupId: string;
  rank: number;
  paddingIndices: number[];
  paddingScores: number[];
  scoreSides: string[];
  steps: { effectivePly: number; originalPly: number | null; synthetic: boolean }[];
}

export interface FenRecoveryResult {
  schemaVersion: number;
  engineVersion: string;
  pgn: string;
  bestPgn: string;
  startFen: string;
  fullyRecovered: boolean;
  failedPlies: number[];
  longestRecoveredPly: number;
  steps?: unknown[];
  preprocessing?: Record<string, unknown>;
  bestMoveLists: RecoveryLine[];
  finalMoveLists: string[][];
  recoveryGroups: { id: string; paddingIndices: number[]; lineIndices: number[] }[];
  recovery: Record<string, unknown>;
}

type RecoveryHeaders = Partial<Record<"Event" | "Site" | "Date" | "Round" | "White" | "Black" | "Result" | "SetUp" | "FEN", string>>;
export type FenRecoveryFailureCode = "RECOVERY_BRANCH_LIMIT" | "RECOVERY_INVALID_INPUT" | "RECOVERY_TIMEOUT" | "RECOVERY_UNAVAILABLE" | "RECOVERY_REJECTED";

export class FenRecoveryServiceError extends Error {
  constructor(public readonly code: FenRecoveryFailureCode, public readonly httpStatus: number, message: string) {
    super(message);
    this.name = "FenRecoveryServiceError";
  }
}

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

function postRecovery(url: URL, payload: object): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(new Error("FEN recovery response is too large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode ?? 500, body: Buffer.concat(chunks).toString("utf8") }));
    });
    // A wall-clock deadline includes connection establishment, not just idle socket time.
    const timer = setTimeout(() => request.destroy(new Error("FEN recovery request timed out")), env.RECOVERY_TIMEOUT_MS);
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
    request.end(body);
  });
}

export function validateV4Response(value: unknown): FenRecoveryResult {
  const data = value as FenRecoveryResult | null;
  if (!data || data.schemaVersion !== 4 || data.engineVersion !== "recover_service_v4"
    || typeof data.pgn !== "string" || typeof data.bestPgn !== "string"
    || typeof data.fullyRecovered !== "boolean" || !Array.isArray(data.failedPlies)
    || !Array.isArray(data.bestMoveLists) || !Array.isArray(data.recoveryGroups)) {
    throw new Error("Invalid V4 recovery response");
  }
  for (const line of data.bestMoveLists) {
    if (!Array.isArray(line.uciMoves) || !line.uciMoves.every(move => typeof move === "string")
      || !Array.isArray(line.sanMoves) || line.sanMoves.length !== line.uciMoves.length
      || !Array.isArray(line.assumedFens) || line.assumedFens.length !== line.uciMoves.length
      || !Array.isArray(line.steps) || line.steps.length !== line.uciMoves.length
      || typeof line.pgn !== "string" || typeof line.startFen !== "string"
      || !Array.isArray(line.paddingIndices) || !Array.isArray(line.paddingScores)
      || !Array.isArray(line.scoreSides) || line.scoreSides.length !== line.paddingIndices.length
      || line.paddingIndices.length !== line.paddingScores.length
      || !line.paddingScores.every(Number.isFinite)
      || !line.paddingIndices.every((index, i, all) => Number.isInteger(index) && index >= 0
        && index < line.uciMoves.length && (i === 0 || index > all[i - 1]!))) {
      throw new Error("Invalid V4 recovery line");
    }
  }
  for (const group of data.recoveryGroups) {
    if (!Array.isArray(group.lineIndices) || !Array.isArray(group.paddingIndices)
      || !group.lineIndices.every(index => Number.isInteger(index) && data.bestMoveLists[index]?.groupId === group.id)) {
      throw new Error("Invalid V4 recovery group");
    }
  }
  return data;
}

export async function recoverFenHistory(
  fenHistory: string[], startFen: string | undefined, headers: RecoveryHeaders,
  options: { includeSteps?: boolean; debug?: boolean; exposeServiceErrors?: boolean } = {},
): Promise<FenRecoveryResult | null> {
  const baseUrl = env.RECOVER_SERVICE_URL?.trim().replace(/\/$/, "");
  if (!baseUrl || !fenHistory.length) return null;
  try {
    const payload = { fenHistory, startFen, headers, maxBranches: 10000 };
    if (options.debug) console.log("[FEN RECOVERY V4] Request", payload);
    const response = await postRecovery(new URL(`${baseUrl}/recover`), payload);
    if (response.status < 200 || response.status >= 300) {
      const errorBody = JSON.parse(response.body) as { detail?: unknown; code?: string };
      const detail = typeof errorBody.detail === "string" ? errorBody.detail : "Recovery request rejected";
      const invalid = response.status === 400 || errorBody.code === "INVALID_RECOVERY_INPUT";
      const limit = errorBody.code === "RECOVERY_BRANCH_LIMIT";
      const timeout = response.status === 504 || errorBody.code === "RECOVERY_TIMEOUT";
      const unavailable = response.status === 503;
      throw new FenRecoveryServiceError(
        invalid ? "RECOVERY_INVALID_INPUT" : limit ? "RECOVERY_BRANCH_LIMIT" : timeout ? "RECOVERY_TIMEOUT" : unavailable ? "RECOVERY_UNAVAILABLE" : "RECOVERY_REJECTED",
        invalid ? 400 : limit ? 422 : timeout ? 504 : unavailable ? 503 : 502, detail);
    }
    return validateV4Response(JSON.parse(response.body));
  } catch (error) {
    if (options.exposeServiceErrors) {
      if (error instanceof FenRecoveryServiceError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const timeout = /timed out/i.test(message);
      throw new FenRecoveryServiceError(timeout ? "RECOVERY_TIMEOUT" : "RECOVERY_UNAVAILABLE", timeout ? 504 : 503, message);
    }
    console.warn("[FEN RECOVERY V4] Recovery unavailable", error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function recoverFenHistoryToPgn(fenHistory: string[], startFen: string | undefined, headers: RecoveryHeaders): Promise<string | null> {
  return (await recoverFenHistory(fenHistory, startFen, headers))?.bestPgn ?? null;
}
