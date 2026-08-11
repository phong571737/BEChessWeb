import { Chess } from "chess.js";
import initStockfish from "stockfish";

type StockfishEngine = {
    listener?: (line: string) => void;
    sendCommand: (command: string) => void;
};

export interface PositionEvaluation {
    cp: number | null;
    mate: number | null;
    depth: number;
}

// Keep the backend decision deterministic: the physical-board restart path
// uses the same fixed depth as the live board evaluation instead of a
// machine-dependent movetime search.
const SEARCH_DEPTH = 16;
const SEARCH_TIMEOUT_MS = 8_000;
const enginePromise: Promise<StockfishEngine> = initStockfish("lite-single") as Promise<StockfishEngine>;
let analysisQueue: Promise<unknown> = Promise.resolve();

function parseScore(line: string, turn: "w" | "b"): PositionEvaluation | null {
    if (!line.startsWith("info ") || !line.includes(" score ")) return null;
    const depthMatch = line.match(/\bdepth\s+(\d+)/);
    const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
    if (!scoreMatch) return null;
    const value = Number(scoreMatch[2]) * (turn === "w" ? 1 : -1);
    return {
        cp: scoreMatch[1] === "cp" ? value : null,
        mate: scoreMatch[1] === "mate" ? value : null,
        depth: depthMatch ? Number(depthMatch[1]) : 0,
    };
}

async function evaluatePositionInternal(fen: string): Promise<PositionEvaluation | null> {
    const position = new Chess(fen);
    const engine = await enginePromise;

    return new Promise((resolve) => {
        let latest: PositionEvaluation | null = null;
        let settled = false;
        const finish = (value: PositionEvaluation | null) => {
            if (settled) return;
            settled = true;
            engine.listener = undefined;
            resolve(value);
        };
        const timeout = setTimeout(() => {
            engine.sendCommand("stop");
            finish(latest);
        }, SEARCH_TIMEOUT_MS);

        engine.listener = (line: string) => {
            const text = String(line);
            const parsed = parseScore(text, position.turn());
            if (parsed) latest = parsed;
            if (text.startsWith("bestmove ")) {
                clearTimeout(timeout);
                finish(latest);
            }
        };

        engine.sendCommand("stop");
        engine.sendCommand(`position fen ${position.fen()}`);
        engine.sendCommand(`go depth ${SEARCH_DEPTH}`);
    });
}

/** Serialize searches because the lightweight WASM engine is single-threaded. */
/** Queue the single-threaded engine so concurrent MQTT commands cannot mix responses. */
export function evaluatePosition(fen: string): Promise<PositionEvaluation | null> {
    const task = analysisQueue.then(() => evaluatePositionInternal(fen));
    analysisQueue = task.catch(() => undefined);
    return task;
}
