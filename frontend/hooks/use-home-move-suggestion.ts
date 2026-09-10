"use client"

import type { Square } from "chess.js";
import { useEffect, useState } from "react";
import { publicPath } from "@/lib/public-path";

export interface HomeMoveSuggestion {
  from: Square;
  to: Square;
}

type Listener = (move: HomeMoveSuggestion | null) => void;

interface SearchTask {
  fen: string;
  listeners: Set<Listener>;
}

const SEARCH_DEPTH = 16;
const MOVE_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const suggestionCache = new Map<string, HomeMoveSuggestion | null>();
const searchQueue: SearchTask[] = [];
let currentSearch: SearchTask | null = null;
let worker: Worker | null = null;
let workerReady = false;
let workerRetryCount = 0;
let workerRetryTimer: number | null = null;

function cacheSuggestion(fen: string, move: HomeMoveSuggestion | null) {
  suggestionCache.delete(fen);
  suggestionCache.set(fen, move);
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
      if (!line.startsWith("bestmove ") || !currentSearch) continue;

      const task = currentSearch;
      const bestMove = line.trim().split(/\s+/)[1] ?? "";
      const move = MOVE_PATTERN.test(bestMove)
        ? { from: bestMove.slice(0, 2) as Square, to: bestMove.slice(2, 4) as Square }
        : null;
      cacheSuggestion(task.fen, move);
      task.listeners.forEach((listener) => listener(move));
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
  const task = existingTask ?? { fen, listeners: new Set<Listener>() };
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
  const [suggestion, setSuggestion] = useState<HomeMoveSuggestion | null>(null);

  useEffect(() => {
    setSuggestion(null);
    if (!enabled || !fen) return;
    return subscribeToSuggestion(fen, setSuggestion);
  }, [enabled, fen]);

  return suggestion;
}
