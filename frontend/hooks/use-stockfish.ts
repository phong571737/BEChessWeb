"use client"

import { useEffect, useRef, useState } from "react";
import { publicPath } from "@/lib/public-path";

export function useStockfish(enabled = true) {
    const workerRef = useRef<Worker | null>(null);
    const onMessageRef = useRef<((line: string) => void) | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!enabled) {
            setIsReady(false);
            setHasError(false);
            return;
        }

        const worker = new Worker(publicPath("/stockfish/stockfish-18-lite-single.js"));
        let retryTimer: number | null = null;
        let retryQueued = false;
        workerRef.current = worker;
        setIsReady(false);
        setHasError(false);

        const handleError = (event: Event) => {
            if (workerRef.current !== worker) return;
            setIsReady(false);
            setHasError(true);
            console.error("Stockfish worker error", event);

            // A transient asset or worker startup failure should not leave the
            // evaluation bar permanently stuck without another attempt.
            if (!retryQueued && attempt < 2) {
                retryQueued = true;
                retryTimer = window.setTimeout(() => setAttempt((value) => value + 1), 500 * (attempt + 1));
            }
        };

        worker.onerror = handleError;
        worker.onmessageerror = handleError;
        worker.onmessage = (e) => {
            const line = e.data as string;
            if (line.includes("readyok")) {
                setIsReady(true);
                setHasError(false);
            }
            onMessageRef.current?.(line);
        };

        worker.postMessage("uci");
        worker.postMessage("ucinewgame");
        worker.postMessage("isready");

        return () => {
            if (retryTimer != null) window.clearTimeout(retryTimer);
            worker.postMessage("quit");
            worker.terminate();
            if (workerRef.current === worker) workerRef.current = null;
            setIsReady(false);
        };
    }, [enabled, attempt]);

    return { workerRef, onMessageRef, isReady, hasError };
}
