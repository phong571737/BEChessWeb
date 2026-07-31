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
  initialTimeMs?: number;
  incrementMs?: number;
  resetRevision?: number;
}

// Single fallback for games created before clock fields existed.
export const DEFAULT_INITIAL_TIME_MS = 10 * 60 * 1_000;
const DEFAULT_INCREMENT_MS = 0;

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
  initialTimeMs: number;
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
  initialTimeMs = DEFAULT_INITIAL_TIME_MS,
  incrementMs = DEFAULT_INCREMENT_MS,
  resetRevision,
}: UseChessClockOptions) {
  // This placeholder is never rendered: the board stays in its loading state
  // until the game configuration has been fetched.
  const [whiteMs, setWhiteMs] = useState(0);
  const [blackMs, setBlackMs] = useState(0);
  const [activeSide, setActiveSide] = useState<ClockSide>("white");

  const whiteMsRef = useRef(0);
  const blackMsRef = useRef(0);
  const activeSideRef = useRef<ClockSide>("white");
  const lastTickRef = useRef(Date.now());
  const previousMoveCountRef = useRef(0);
  const isEnded = status === GAME_STATUS.ENDED || status === GAME_STATUS.FINISHED;
  const initializedGameRef = useRef<string | null>(null);
  const appliedResetRevisionRef = useRef<number | undefined>(undefined);
  const lastPersistRef = useRef(0);

  const persistClock = (moveCountToPersist: number) => {
    const now = Date.now();
    saveClockData(gameID, {
      whiteMs: whiteMsRef.current,
      blackMs: blackMsRef.current,
      activeSide: activeSideRef.current,
      lastTickAt: now,
      moveCount: moveCountToPersist,
      initialTimeMs,
    });
    lastPersistRef.current = now;
  };

  // ── Initialize only after the persisted game configuration has loaded ──
  useEffect(() => {
    if (!isLoaded || initializedGameRef.current === gameID) return;

    const saved = loadClockData(gameID);
    const restored = saved && saved.initialTimeMs === initialTimeMs ? saved : null;
    const next = restored ?? {
      whiteMs: initialTimeMs,
      blackMs: initialTimeMs,
      activeSide: "white" as ClockSide,
      lastTickAt: Date.now(),
      moveCount: 0,
      initialTimeMs,
    };

    whiteMsRef.current = next.whiteMs;
    blackMsRef.current = next.blackMs;
    activeSideRef.current = next.activeSide;
    lastTickRef.current = next.lastTickAt;
    previousMoveCountRef.current = next.moveCount;
    setWhiteMs(next.whiteMs);
    setBlackMs(next.blackMs);
    setActiveSide(next.activeSide);

    if (restored && restored.moveCount > 0) {
      // compute elapsed since last saved tick and advance the clock
      const elapsed = Date.now() - restored.lastTickAt;
      if (elapsed > 0 && !isEnded) {
        if (restored.activeSide === "white") {
          whiteMsRef.current = Math.max(0, restored.whiteMs - elapsed);
          setWhiteMs(whiteMsRef.current);
        } else {
          blackMsRef.current = Math.max(0, restored.blackMs - elapsed);
          setBlackMs(blackMsRef.current);
        }
      }
      lastTickRef.current = Date.now();
    }
    initializedGameRef.current = gameID;
  }, [gameID, initialTimeMs, isEnded, isLoaded]);

  useEffect(() => {
    if (!isLoaded || resetRevision === undefined || appliedResetRevisionRef.current === resetRevision) return;
    appliedResetRevisionRef.current = resetRevision;
    const now = Date.now();
    clearClockData(gameID);
    whiteMsRef.current = initialTimeMs;
    blackMsRef.current = initialTimeMs;
    activeSideRef.current = "white";
    lastTickRef.current = now;
    previousMoveCountRef.current = 0;
    setWhiteMs(initialTimeMs);
    setBlackMs(initialTimeMs);
    setActiveSide("white");
  }, [gameID, initialTimeMs, isLoaded, resetRevision]);

  useEffect(() => {
    if (!isLoaded || !fen) return;
    const inferredSide = toClockSide(fen);
    activeSideRef.current = inferredSide;
    setActiveSide(inferredSide);
  }, [fen, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;

    if (!pgn || isEnded) return;

    if (moveCount > previousMoveCountRef.current) {
      // The authoritative post-move FEN identifies the player whose clock
      // must run now. For example, after White's first move it is Black.
      const nextSide = toClockSide(fen);
      const movedSide = nextSide === "white" ? "black" : "white";

      if (movedSide === "white") {
        whiteMsRef.current = whiteMsRef.current + incrementMs;
        setWhiteMs(whiteMsRef.current);
      } else {
        blackMsRef.current = blackMsRef.current + incrementMs;
        setBlackMs(blackMsRef.current);
      }

      activeSideRef.current = nextSide;
      setActiveSide(nextSide);
      lastTickRef.current = Date.now();

      // Persist after a move — update the moveCount so reloads pick up the correct baseline
      persistClock(moveCount);
    }

    previousMoveCountRef.current = moveCount;
  }, [moveCount, pgn, fen, isLoaded, isEnded, incrementMs, initialTimeMs, gameID]);

  useEffect(() => {
    // The selected time is displayed while the board is waiting; countdown
    // begins only after the first valid move has been recorded.
    if (!isLoaded || moveCount === 0 || isEnded || initializedGameRef.current !== gameID) return;

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

      // Persist periodically; rendering still updates every second.
      if (now - lastPersistRef.current >= 10_000) persistClock(moveCount);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
      persistClock(moveCount);
    };
  }, [isLoaded, isEnded, gameID, moveCount, initialTimeMs]);

  return {
    whiteMs,
    blackMs,
    activeSide,
    formatClockMs,
  };
}
