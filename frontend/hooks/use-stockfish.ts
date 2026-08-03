"use client"

import { useEffect, useRef, useState } from "react";
import { publicPath } from "@/lib/public-path";

export function useStockfish(enabled = true) {
    const workerRef = useRef<Worker | null>(null);
    const onMessageRef = useRef<((line: string) => void) | null>(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setIsReady(false);
            return;
        }

        const worker = new Worker(publicPath("/stockfish/stockfish-18-lite-single.js"));
        workerRef.current = worker;
        setIsReady(false);

        worker.onerror = (e) => console.error("worker error", e);
        worker.onmessage = (e) => {
            const line = e.data as string;
            if (line.includes("readyok")) setIsReady(true);
            onMessageRef.current?.(line);
        };

        worker.postMessage("uci");
        worker.postMessage("ucinewgame");
        worker.postMessage("isready");

        return () => {
            worker.postMessage("quit");
            worker.terminate();
            workerRef.current = null;
            setIsReady(false);
        };
    }, [enabled]);

    return { workerRef, onMessageRef, isReady };
}
