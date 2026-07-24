import { GAME_STATUS } from "@/lib/constants/game";
import { useEffect, useRef, useState } from "react";

export type ClockSide = "white" | "black";

interface UseChessClockOptions {
  gameID: string;
  fen: string;
  pgn: string;
  status?: string | null;
  isLoaded: boolean;
  moveCount: number;
  initialSeconds?: number;
  incrementSeconds?: number;
}

const DEFAULT_INITIAL_SECONDS = 10 * 60;
const DEFAULT_INCREMENT_SECONDS = 0;

function toClockSide(fen: string): ClockSide {
  const turn = (fen?.split(" ")[1] ?? "w").toLowerCase();
  return turn === "b" ? "black" : "white";
}

export function formatClockMs(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function useChessClock({
  gameID,
  fen,
  pgn,
  status,
  isLoaded,
  moveCount,
  initialSeconds = DEFAULT_INITIAL_SECONDS,
  incrementSeconds = DEFAULT_INCREMENT_SECONDS,
}: UseChessClockOptions) {
  const [whiteMs, setWhiteMs] = useState(initialSeconds * 1000);
  const [blackMs, setBlackMs] = useState(initialSeconds * 1000);
  const [activeSide, setActiveSide] = useState<ClockSide>("white");

  const whiteMsRef = useRef(initialSeconds * 1000);
  const blackMsRef = useRef(initialSeconds * 1000);
  const activeSideRef = useRef<ClockSide>("white");
  const lastTickRef = useRef(Date.now());
  const previousMoveCountRef = useRef(moveCount);
  const isEnded = status === GAME_STATUS.ENDED || status === GAME_STATUS.FINISHED;

  useEffect(() => {
    const resetMs = initialSeconds * 1000;
    whiteMsRef.current = resetMs;
    blackMsRef.current = resetMs;
    setWhiteMs(resetMs);
    setBlackMs(resetMs);
    activeSideRef.current = "white";
    setActiveSide("white");
    previousMoveCountRef.current = 0;
    lastTickRef.current = Date.now();
  }, [gameID, initialSeconds]);

  useEffect(() => {
    if (!isLoaded || !fen) return;
    const inferredSide = toClockSide(fen);
    activeSideRef.current = inferredSide;
    setActiveSide(inferredSide);
  }, [fen, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !pgn || isEnded) return;

    if (moveCount > previousMoveCountRef.current) {
      const movedSide = activeSideRef.current;
      const incrementMs = incrementSeconds * 1000;

      if (movedSide === "white") {
        whiteMsRef.current = whiteMsRef.current + incrementMs;
        setWhiteMs(whiteMsRef.current);
      } else {
        blackMsRef.current = blackMsRef.current + incrementMs;
        setBlackMs(blackMsRef.current);
      }

      const nextSide = movedSide === "white" ? "black" : "white";
      activeSideRef.current = nextSide;
      setActiveSide(nextSide);
      lastTickRef.current = Date.now();
    }

    previousMoveCountRef.current = moveCount;
  }, [moveCount, pgn, isLoaded, isEnded, incrementSeconds]);

  useEffect(() => {
    if (!isLoaded || isEnded) return;

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;

      if (activeSideRef.current === "white") {
        const nextWhiteMs = Math.max(0, whiteMsRef.current - delta);
        whiteMsRef.current = nextWhiteMs;
        setWhiteMs(nextWhiteMs);
      } else {
        const nextBlackMs = Math.max(0, blackMsRef.current - delta);
        blackMsRef.current = nextBlackMs;
        setBlackMs(nextBlackMs);
      }
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isLoaded, isEnded, fen, status]);

  return {
    whiteMs,
    blackMs,
    activeSide,
    formatClockMs,
  };
}
