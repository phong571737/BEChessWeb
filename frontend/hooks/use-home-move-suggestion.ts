"use client"

import type { Square } from "chess.js";
import { useEffect, useState } from "react";
import { publicPath } from "@/lib/public-path";

export interface HomeMoveSuggestion {
  from: Square;
  to: Square;
}

export interface HomePositionAnalysis {
  suggestedMove: HomeMoveSuggestion | null;
  cp: number | null;
  mate: number | null;
}

type Listener = (analysis: HomePositionAnalysis | null) => void;

interface SearchTask {
  fen: string;
  listeners: Set<Listener>;
  cp: number | null;
  mate: number | null;
}

const SEARCH_DEPTH = 16;
const MOVE_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const suggestionCache = new Map<string, HomePositionAnalysis | null>();
const searchQueue: SearchTask[] = [];
let currentSearch: SearchTask | null = null;
let worker: Worker | null = null;
let workerReady = false;
let workerRetryCount = 0;
let workerRetryTimer: number | null = null;

function cacheSuggestion(fen: string, analysis: HomePositionAnalysis | null) {
  suggestionCache.delete(fen);
  suggestionCache.set(fen, analysis);
  if (suggestionCache.size > 100) {
    const oldestFen = suggestionCache.keys().next().value;
    if (oldestFen) suggestionCache.delete(oldestFen);
  }
}

function startNextSearch() {
  if (!workerReady || !worker || currentSearch) return;

  while (searchQueue.length > 0 && searchQueue[0]?.listeners.size === 0) searchQueue.shift();
  const next = searchQueue.shift();
  if (!next) return;

  currentSearch = next;
  worker.postMessage(`position fen ${next.fen}`);
  worker.postMessage(`go depth ${SEARCH_DEPTH}`);
}

function resetWorker() {
  worker?.terminate();
  worker = null;
  workerReady = false;
  if (currentSearch) {
    searchQueue.unshift(currentSearch);
    currentSearch = null;
  }
}

function ensureWorker() {
  if (worker || typeof window === "undefined") return;

  const instance = new Worker(publicPath("/stockfish/stockfish-18-lite-single.js"));
  worker = instance;

  instance.onmessage = (event) => {
    const lines = String(event.data).split(/\r?\n/);
    for (const line of lines) {
      if (line.includes("readyok")) {
        workerReady = true;
        workerRetryCount = 0;
        startNextSearch();
        continue;
      }
      if (line.startsWith("info ") && currentSearch) {
        const multiPv = line.match(/\bmultipv (\d+)/);
        if (multiPv && Number(multiPv[1]) !== 1) continue;
        const blackToMove = currentSearch.fen.split(" ")[1] === "b";
        const cpMatch = line.match(/\bscore cp (-?\d+)/);
        if (cpMatch) {
          const raw = Number(cpMatch[1]);
          currentSearch.cp = blackToMove ? -raw : raw;
          currentSearch.mate = null;
          continue;
        }
        const mateMatch = line.match(/\bscore mate (-?\d+)/);
        if (mateMatch) {
          const raw = Number(mateMatch[1]);
          currentSearch.mate = blackToMove ? -raw : raw;
          currentSearch.cp = null;
        }
        continue;
      }
      if (!line.startsWith("bestmove ") || !currentSearch) continue;

      const task = currentSearch;
      const bestMove = line.trim().split(/\s+/)[1] ?? "";
      const suggestedMove = MOVE_PATTERN.test(bestMove)
        ? { from: bestMove.slice(0, 2) as Square, to: bestMove.slice(2, 4) as Square }
        : null;
      const analysis = { suggestedMove, cp: task.cp, mate: task.mate };
      cacheSuggestion(task.fen, analysis);
      task.listeners.forEach((listener) => listener(analysis));
      currentSearch = null;
      startNextSearch();
    }
  };

  const handleWorkerError = (event: Event) => {
    console.error("Homepage Stockfish worker error", event);
    if (worker !== instance) return;
    resetWorker();
    if (workerRetryCount >= 2) return;
    workerRetryCount += 1;
    workerRetryTimer = window.setTimeout(() => {
      workerRetryTimer = null;
      ensureWorker();
    }, 500 * workerRetryCount);
  };
  instance.onerror = handleWorkerError;
  instance.onmessageerror = handleWorkerError;
  instance.postMessage("uci");
  instance.postMessage("ucinewgame");
  instance.postMessage("isready");
}

function subscribeToSuggestion(fen: string, listener: Listener) {
  if (suggestionCache.has(fen)) {
    listener(suggestionCache.get(fen) ?? null);
    return () => undefined;
  }

  const existingTask = currentSearch?.fen === fen
    ? currentSearch
    : searchQueue.find((task) => task.fen === fen);
  const task = existingTask ?? { fen, listeners: new Set<Listener>(), cp: null, mate: null };
  task.listeners.add(listener);
  if (!existingTask) searchQueue.push(task);
  ensureWorker();
  startNextSearch();

  return () => {
    task.listeners.delete(listener);
    if (currentSearch === task && task.listeners.size === 0) worker?.postMessage("stop");
  };
}

/** Uses one shared, queued Stockfish worker for all mini boards on the homepage. */
export function useHomeMoveSuggestion(fen: string | undefined, enabled: boolean) {
  const [resolved, setResolved] = useState<{ fen: string; analysis: HomePositionAnalysis | null } | null>(null);

  useEffect(() => {
    if (!enabled || !fen) return;
    return subscribeToSuggestion(fen, (analysis) => setResolved({ fen, analysis }));
  }, [enabled, fen]);

  return enabled && fen && resolved?.fen === fen ? resolved.analysis : null;
}
