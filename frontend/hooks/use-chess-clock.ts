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

// ── sessionStorage helpers ──────────────────────────────────────────
const STORAGE_PREFIX = "chess:clock:";

interface ClockPersistData {
  whiteMs: number;
  blackMs: number;
  activeSide: ClockSide;
  lastTickAt: number;
  moveCount: number;
}

function loadClockData(gameID: string): ClockPersistData | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + gameID);
    if (!raw) return null;
    return JSON.parse(raw) as ClockPersistData;
  } catch {
    return null;
  }
}

function saveClockData(gameID: string, data: ClockPersistData): void {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + gameID, JSON.stringify(data));
  } catch {
    // storage full or blocked — ignore
  }
}

function clearClockData(gameID: string): void {
  try {
    sessionStorage.removeItem(STORAGE_PREFIX + gameID);
  } catch {
    // ignore
  }
}
// ────────────────────────────────────────────────────────────────────

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
  const initialMs = initialSeconds * 1000;

  // ── Initialise from sessionStorage or fall back to default ──────
  const [state, setState] = useState<ClockPersistData>(() => {
    const saved = loadClockData(gameID);
    if (saved) {
      return saved;
    }
    return {
      whiteMs: initialMs,
      blackMs: initialMs,
      activeSide: "white",
      lastTickAt: Date.now(),
      moveCount: 0,
    };
  });

  const [whiteMs, setWhiteMs] = useState(state.whiteMs);
  const [blackMs, setBlackMs] = useState(state.blackMs);
  const [activeSide, setActiveSide] = useState<ClockSide>(state.activeSide);

  const whiteMsRef = useRef(state.whiteMs);
  const blackMsRef = useRef(state.blackMs);
  const activeSideRef = useRef<ClockSide>(state.activeSide);
  const lastTickRef = useRef(state.lastTickAt);
  const previousMoveCountRef = useRef(state.moveCount);
  const isEnded = status === GAME_STATUS.ENDED || status === GAME_STATUS.FINISHED;
  const restoringRef = useRef<boolean>(true);

  // ── Restore persisted clock offsets when game loads ─────────────
  useEffect(() => {
    if (!isLoaded) return;
    if (state.moveCount > 0) {
      // compute elapsed since last saved tick and advance the clock
      const elapsed = Date.now() - state.lastTickAt;
      if (elapsed > 0 && !isEnded) {
        if (state.activeSide === "white") {
          whiteMsRef.current = Math.max(0, state.whiteMs - elapsed);
          setWhiteMs(whiteMsRef.current);
        } else {
          blackMsRef.current = Math.max(0, state.blackMs - elapsed);
          setBlackMs(blackMsRef.current);
        }
      }
      lastTickRef.current = Date.now();
    }
    restoringRef.current = false;
  }, [isLoaded]); // only run once after load

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

      // Persist after a move — update the moveCount so reloads pick up the correct baseline
      saveClockData(gameID, {
        whiteMs: whiteMsRef.current,
        blackMs: blackMsRef.current,
        activeSide: nextSide,
        lastTickAt: Date.now(),
        moveCount,
      });
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

      // Persist every tick so mid-turn time survives page reload
      saveClockData(gameID, {
        whiteMs: whiteMsRef.current,
        blackMs: blackMsRef.current,
        activeSide: activeSideRef.current,
        lastTickAt: Date.now(),
        moveCount,
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isLoaded, isEnded, fen, status, gameID, moveCount]);

  return {
    whiteMs,
    blackMs,
    activeSide,
    formatClockMs,
  };
}
