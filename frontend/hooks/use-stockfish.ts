"use client"

import { useEffect, useRef, useState } from "react";

export function useStockfish() {
    const workerRef = useRef<Worker | null>(null);
    const onMessageRef = useRef<((line: string) => void) | null>(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const worker = new Worker("/stockfish/stockfish-18-lite-single.js");
        workerRef.current = worker;
        console.log("worker created", worker);
        setIsReady(false);

        worker.onerror = (e) => console.error("worker error", e);
        worker.onmessage = (e) => {
            const line = e.data as string;
            if (line.includes("readyok")) setIsReady(true);
            onMessageRef.current?.(line);
            // console.log("SF: ", line);
        };

        worker.postMessage("uci");
        worker.postMessage("isready");

        return () => {
            worker.postMessage("quit");
            worker.terminate();
            workerRef.current = null;
        }
    }, []);

    return {workerRef, onMessageRef, isReady};
}