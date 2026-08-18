import { Chess } from "chess.js";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { env } from "../config/environment.js";

interface RawRecoveryResponse {
  fullyRecovered?: unknown;
  continuedToEnd?: unknown;
  stoppedAtMoveIndex?: unknown;
  skippedXIndexes?: unknown;
  skippedRanges?: unknown;
  unresolvedSegments?: unknown;
  paddingAttempts?: unknown;
  paddingRepairs?: unknown;
  normalizedFens?: unknown;
  normalizedSides?: unknown;
  inferredSides?: unknown;
  inferredMoves?: unknown;
  components?: unknown;
  moveTemplates?: unknown;
  final_move_lists?: unknown;
  branchCount?: unknown;
  moveLists?: unknown;
}

interface RecoveryLine {
  uciMoves: string[];
  sanMoves: string[];
  moveSources: string[];
  assumedFens: string[];
  movetext: string;
}

interface TokenMetadata {
  processedIndex: number | null;
  originalPly: number | null;
  source: "observed" | "assumed" | "padded" | "unresolved";
}

export interface FenRecoveryResult {
  schemaVersion: number;
  engineVersion: string;
  pgn: string;
  bestPgn: string;
  fullyRecovered: boolean;
  failedPlies: number[];
  longestRecoveredPly: number;
  steps?: unknown[];
  preprocessing?: Record<string, unknown>;
  retry?: Record<string, unknown>;
  bestMoveLists: RecoveryLine[];
  finalMoveLists: string[][];
  recovery: Record<string, unknown>;
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

export type FenRecoveryFailureCode = "RECOVERY_BRANCH_LIMIT" | "RECOVERY_INVALID_INPUT" | "RECOVERY_TIMEOUT" | "RECOVERY_UNAVAILABLE" | "RECOVERY_REJECTED";

export class FenRecoveryServiceError extends Error {
  constructor(
    public readonly code: FenRecoveryFailureCode,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "FenRecoveryServiceError";
  }
}

const RECOVERY_TIMEOUT_MS = 16_000;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const DEFAULT_FEN = new Chess().fen();
const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/i;

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

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function stringLists(value: unknown): string[][] {
  return Array.isArray(value)
    ? value.filter(Array.isArray).map((items) => items.map((item) => String(item)))
    : [];
}

function positionKey(fen: string): string {
  return fen.trim().split(/\s+/, 1)[0] ?? "";
}

function preprocessingMap(fenHistory: string[], startFen: string): { groups: number[][]; metadata: Record<string, unknown> } {
  const groups: number[][] = [];
  const leadingDuplicateIndexes: number[] = [];
  let previousPosition = positionKey(startFen);
  fenHistory.forEach((fen, index) => {
    const currentPosition = positionKey(fen);
    if (currentPosition === previousPosition) {
      const previousGroup = groups[groups.length - 1];
      if (previousGroup) previousGroup.push(index);
      else leadingDuplicateIndexes.push(index);
      return;
    }
    groups.push([index]);
    previousPosition = currentPosition;
  });
  return {
    groups,
    metadata: {
      originalFenCount: fenHistory.length,
      processedFenCount: groups.length,
      removedDuplicateCount: fenHistory.length - groups.length,
      processedToInputIndexes: groups,
      leadingDuplicateIndexes,
    },
  };
}

function paddingCounts(data: RawRecoveryResponse): Map<number, number> {
  const counts = new Map<number, number>();
  if (!Array.isArray(data.paddingRepairs)) return counts;
  for (const value of data.paddingRepairs) {
    if (!value || typeof value !== "object") continue;
    const repair = value as Record<string, unknown>;
    const moveIndex = typeof repair.moveIndex === "number" ? repair.moveIndex : repair.xIndex;
    const paddingCount = repair.paddingCount;
    if (typeof moveIndex === "number" && Number.isInteger(moveIndex)
      && typeof paddingCount === "number" && Number.isInteger(paddingCount) && paddingCount > 0) {
      counts.set(moveIndex, paddingCount);
    }
  }
  return counts;
}

function tokenMetadata(
  data: RawRecoveryResponse,
  tokens: string[],
  groups: number[][],
  includePadding: boolean,
): TokenMetadata[] {
  const inferredMoves = stringList(data.inferredMoves);
  const padding = includePadding ? paddingCounts(data) : new Map<number, number>();
  const metadata: TokenMetadata[] = [];

  inferredMoves.forEach((inferred, processedIndex) => {
    for (let index = 0; index < (padding.get(processedIndex) ?? 0); index++) {
      metadata.push({ processedIndex: null, originalPly: null, source: "padded" });
    }
    metadata.push({
      processedIndex,
      originalPly: groups[processedIndex]?.[0] !== undefined ? groups[processedIndex]![0]! + 1 : processedIndex + 1,
      source: inferred === "X" ? "assumed" : "observed",
    });
  });

  while (metadata.length < tokens.length) {
    metadata.push({ processedIndex: null, originalPly: null, source: "padded" });
  }
  return metadata.slice(0, tokens.length);
}

function safeReferenceFen(rawFen: string | undefined, fallbackFen: string): string {
  if (!rawFen) return fallbackFen;
  try {
    return new Chess(rawFen, { skipValidation: true }).fen();
  } catch {
    const fields = rawFen.trim().split(/\s+/);
    const placement = fields[0];
    const side = fields[1] === "b" ? "b" : "w";
    if (!placement) return fallbackFen;
    const normalized = `${placement} ${side} - - 0 1`;
    try {
      return new Chess(normalized, { skipValidation: true }).fen();
    } catch {
      return fallbackFen;
    }
  }
}

function formatMovetext(tokens: string[]): string {
  return tokens.map((token, index) => {
    const moveNumber = Math.floor(index / 2) + 1;
    return `${index % 2 === 0 ? `${moveNumber}.` : `${moveNumber}...`} ${token}`;
  }).join("\n");
}

function buildLine(
  tokens: string[],
  data: RawRecoveryResponse,
  startFen: string,
  groups: number[][],
  includePadding: boolean,
): { line: RecoveryLine; metadata: TokenMetadata[] } {
  const normalizedFens = stringList(data.normalizedFens);
  const metadata = tokenMetadata(data, tokens, groups, includePadding);
  let board: Chess;
  try {
    board = new Chess(startFen, { skipValidation: true });
  } catch {
    board = new Chess();
  }

  const sanMoves: string[] = [];
  const moveSources: string[] = [];
  const assumedFens: string[] = [];

  tokens.forEach((token, index) => {
    const item = metadata[index]!;
    let source = item.source;
    let san = "X";
    let applied = false;

    if (token !== "X" && UCI_RE.test(token)) {
      try {
        const move = board.move({
          from: token.slice(0, 2),
          to: token.slice(2, 4),
          promotion: token.slice(4, 5) || undefined,
        });
        if (move) {
          san = move.san;
          applied = true;
        }
      } catch {
        san = token;
      }
    } else {
      source = "unresolved";
    }

    if (applied) {
      assumedFens.push(board.fen());
    } else {
      const rawReference = item.processedIndex === null ? undefined : normalizedFens[item.processedIndex];
      const referenceFen = safeReferenceFen(rawReference, board.fen());
      assumedFens.push(referenceFen);
      try {
        board.load(referenceFen, { skipValidation: true });
      } catch {}
    }
    sanMoves.push(san);
    moveSources.push(source);
  });

  return {
    line: {
      uciMoves: tokens,
      sanMoves,
      moveSources,
      assumedFens,
      movetext: formatMovetext(sanMoves),
    },
    metadata,
  };
}

function renderPgn(headers: RecoveryHeaders, startFen: string, line: RecoveryLine): string {
  const values: Record<string, string> = {
    Event: headers.Event ?? "?",
    Site: headers.Site ?? "?",
    Date: headers.Date ?? "????.??.??",
    Round: headers.Round ?? "1",
    White: headers.White ?? "?",
    Black: headers.Black ?? "?",
    Result: headers.Result ?? "*",
  };
  if (startFen !== DEFAULT_FEN) {
    values.SetUp = "1";
    values.FEN = startFen;
  }
  const headerText = Object.entries(values)
    .map(([name, value]) => `[${name} "${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`)
    .join("\n");
  return `${headerText}\n\n${line.movetext}`;
}

function adaptRecoveryResponse(
  data: RawRecoveryResponse,
  fenHistory: string[],
  startFen: string,
  headers: RecoveryHeaders,
  includeSteps: boolean,
): FenRecoveryResult | null {
  const finalLists = stringLists(data.final_move_lists);
  if (finalLists.length === 0) return null;

  const { groups, metadata: preprocessing } = preprocessingMap(fenHistory, startFen);
  const linesWithMetadata = finalLists.map((tokens) => buildLine(tokens, data, startFen, groups, true));
  const bestMoveLists = linesWithMetadata.map(({ line }) => line);
  const inferredMoves = stringList(data.inferredMoves);
  const original = buildLine(inferredMoves.length > 0 ? inferredMoves : finalLists[0]!, data, startFen, groups, false);
  const failedPlies = Array.from(new Set(
    linesWithMetadata.flatMap(({ line, metadata }) => line.uciMoves.flatMap((token, index) => {
      const originalPly = metadata[index]?.originalPly;
      return token === "X" && originalPly !== null && originalPly !== undefined ? [originalPly] : [];
    })),
  )).sort((left, right) => left - right);
  const fullyRecovered = data.fullyRecovered === true && finalLists.every((tokens) => !tokens.includes("X"));

  const first = linesWithMetadata[0]!;
  const steps = first.line.uciMoves.map((token, index) => {
    const item = first.metadata[index]!;
    const source = first.line.moveSources[index]!;
    return {
      effectivePly: index + 1,
      originalPly: item.originalPly,
      synthetic: source === "padded",
      observedFen: first.line.assumedFens[index],
      detectedMove: source === "observed" ? token : null,
      detectionError: token === "X" ? "unresolved" : null,
      usedAssumption: source !== "observed",
      candidateCount: finalLists.length,
    };
  });

  return {
    schemaVersion: 3,
    engineVersion: "recover_service_v2",
    pgn: renderPgn(headers, startFen, original.line),
    bestPgn: renderPgn(headers, startFen, bestMoveLists[0]!),
    fullyRecovered,
    failedPlies,
    longestRecoveredPly: failedPlies.length > 0 ? Math.max(0, failedPlies[0]! - 1) : fenHistory.length,
    steps: includeSteps ? steps : undefined,
    preprocessing: includeSteps ? preprocessing : undefined,
    retry: includeSteps ? {
      attempts: Array.isArray(data.paddingAttempts) ? data.paddingAttempts : [],
      repairs: Array.isArray(data.paddingRepairs) ? data.paddingRepairs : [],
    } : undefined,
    bestMoveLists,
    finalMoveLists: finalLists,
    recovery: data as unknown as Record<string, unknown>,
  };
}

export async function recoverFenHistory(
  fenHistory: string[],
  startFen: string | undefined,
  headers: RecoveryHeaders,
  options: { includeSteps?: boolean; debug?: boolean; nRetry?: number; exposeServiceErrors?: boolean } = {},
): Promise<FenRecoveryResult | null> {
  const baseUrl = env.RECOVER_SERVICE_URL?.trim().replace(/\/$/, "");
  if (!baseUrl || fenHistory.length === 0) return null;

  try {
    const payload = {
      fenHistory,
      startFen,
      headers,
      maxBranches: 10000,
      ...(options.nRetry === undefined ? {} : { nRetry: options.nRetry }),
      finalOnly: options.includeSteps !== true,
    };
    if (options.debug) console.log("[FEN RECOVERY 2 - payload backend gửi Python /recover]", payload);
    const response = await postRecovery(new URL(`${baseUrl}/recover`), payload);
    if (response.status < 200 || response.status >= 300) {
      let detail = "FEN recovery request was rejected";
      let serviceCode = "";
      try {
        const errorBody = JSON.parse(response.body) as { detail?: unknown; code?: unknown };
        if (typeof errorBody.detail === "string" && errorBody.detail.trim()) detail = errorBody.detail.trim();
        if (typeof errorBody.code === "string") serviceCode = errorBody.code;
      } catch {}
      console.warn(`[FEN RECOVERY] Sidecar returned HTTP ${response.status}: ${detail}`);
      if (options.exposeServiceErrors) {
        const branchLimit = serviceCode === "RECOVERY_BRANCH_LIMIT" || /more than\s+\d+\s+compatible branches/i.test(detail);
        const invalidInput = serviceCode === "INVALID_RECOVERY_INPUT" || response.status === 400;
        throw new FenRecoveryServiceError(
          branchLimit ? "RECOVERY_BRANCH_LIMIT" : invalidInput ? "RECOVERY_INVALID_INPUT" : "RECOVERY_REJECTED",
          branchLimit ? 422 : invalidInput ? 400 : 502,
          detail,
        );
      }
      return null;
    }

    const data = JSON.parse(response.body) as RawRecoveryResponse;
    if (options.debug) console.log("[FEN RECOVERY 3 - raw response Python /recover]", data);
    return adaptRecoveryResponse(data, fenHistory, startFen?.trim() || DEFAULT_FEN, headers, options.includeSteps === true);
  } catch (error) {
    if (error instanceof FenRecoveryServiceError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (options.exposeServiceErrors) {
      const timedOut = /timed out/i.test(message);
      throw new FenRecoveryServiceError(
        timedOut ? "RECOVERY_TIMEOUT" : "RECOVERY_UNAVAILABLE",
        timedOut ? 504 : 503,
        message,
      );
    }
    console.warn("[FEN RECOVERY] Sidecar unavailable; using local fallback", message);
    return null;
  }
}

export async function recoverFenHistoryToPgn(
  fenHistory: string[],
  startFen: string | undefined,
  headers: RecoveryHeaders,
): Promise<string | null> {
  const result = await recoverFenHistory(fenHistory, startFen, headers);
  return result?.bestPgn ?? null;
}
