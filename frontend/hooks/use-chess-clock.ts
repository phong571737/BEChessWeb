import { GAME_STATUS } from "@/lib/constants/game";
import { DEFAULT_INCREMENT_MS, DEFAULT_INITIAL_TIME_MS } from "@/lib/time-control";
import { useEffect, useRef, useState } from "react";

export type ClockSide = "white" | "black";
export interface ServerClockState { whiteRemainingMs: number; blackRemainingMs: number; activeClockSide: ClockSide; clockStartedAt?: string | null; serverNow?: number; }
interface UseChessClockOptions extends Partial<ServerClockState> { gameID: string; fen: string; pgn: string; status?: string | null; isLoaded: boolean; moveCount: number; initialTimeMs?: number; incrementMs?: number; resetRevision?: number; }
export { DEFAULT_INITIAL_TIME_MS, DEFAULT_INCREMENT_MS } from "@/lib/time-control";
function toClockSide(fen: string): ClockSide { return (fen?.split(" ")[1] ?? "w").toLowerCase() === "b" ? "black" : "white"; }
export function formatClockMs(ms: number): string { const s = Math.floor(Math.max(0, ms) / 1000); return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`; }
const PREFIX = "chess:clock:";
type Persisted = { whiteMs: number; blackMs: number; activeSide: ClockSide; lastTickAt: number; moveCount: number; initialTimeMs: number };
function readPersisted(id: string): Persisted | null { try { const raw = sessionStorage.getItem(PREFIX + id); return raw ? JSON.parse(raw) as Persisted : null; } catch { return null; } }
function writePersisted(id: string, value: Persisted): void { try { sessionStorage.setItem(PREFIX + id, JSON.stringify(value)); } catch { /* optional fallback */ } }
function clearPersisted(id: string): void { try { sessionStorage.removeItem(PREFIX + id); } catch { /* optional fallback */ } }
function monotonicNow(): number { return typeof performance !== "undefined" ? performance.now() : Date.now(); }

export function useChessClock({ gameID, fen, pgn, status, isLoaded, moveCount, initialTimeMs = DEFAULT_INITIAL_TIME_MS, incrementMs: _incrementMs = DEFAULT_INCREMENT_MS, whiteRemainingMs, blackRemainingMs, activeClockSide, clockStartedAt, serverNow, resetRevision }: UseChessClockOptions) {
  const [whiteMs, setWhiteMs] = useState(0); const [blackMs, setBlackMs] = useState(0); const [activeSide, setActiveSide] = useState<ClockSide>("white");
  const whiteRef = useRef(0); const blackRef = useRef(0); const sideRef = useRef<ClockSide>("white"); const tickRef = useRef(monotonicNow()); const initializedRef = useRef<string | null>(null); const resetRef = useRef<number | undefined>(undefined);
  const serverMode = Number.isFinite(whiteRemainingMs) && Number.isFinite(blackRemainingMs); const ended = status === GAME_STATUS.ENDED || status === GAME_STATUS.FINISHED;

  // Server snapshots are authoritative. Never compare the client's wall clock
  // with `serverNow`: device clocks can differ by minutes. The browser only
  // interpolates from the received snapshot with its monotonic clock.
  useEffect(() => {
    if (!isLoaded || !serverMode) return;
    const side = activeClockSide === "black" ? "black" : "white";
    whiteRef.current = Math.max(0, whiteRemainingMs as number);
    blackRef.current = Math.max(0, blackRemainingMs as number);
    sideRef.current = side;
    tickRef.current = monotonicNow();
    initializedRef.current = gameID;
    setWhiteMs(whiteRef.current);
    setBlackMs(blackRef.current);
    setActiveSide(sideRef.current);
  }, [activeClockSide, blackRemainingMs, gameID, isLoaded, serverMode, serverNow, whiteRemainingMs]);
  useEffect(() => { if (!isLoaded || serverMode || initializedRef.current === gameID) return; const saved = readPersisted(gameID); const now = Date.now(); const next = saved ?? { whiteMs: initialTimeMs, blackMs: initialTimeMs, activeSide: "white" as ClockSide, lastTickAt: now, moveCount: 0, initialTimeMs }; whiteRef.current = next.whiteMs; blackRef.current = next.blackMs; sideRef.current = next.activeSide; tickRef.current = monotonicNow(); initializedRef.current = gameID; setWhiteMs(next.whiteMs); setBlackMs(next.blackMs); setActiveSide(next.activeSide); }, [gameID, initialTimeMs, isLoaded, serverMode]);
  useEffect(() => { if (!isLoaded || resetRevision === undefined || resetRef.current === resetRevision) return; resetRef.current = resetRevision; clearPersisted(gameID); whiteRef.current = initialTimeMs; blackRef.current = initialTimeMs; sideRef.current = "white"; tickRef.current = monotonicNow(); setWhiteMs(initialTimeMs); setBlackMs(initialTimeMs); setActiveSide("white"); }, [gameID, initialTimeMs, isLoaded, resetRevision]);
  // Legacy games without persisted server clock fields keep the old FEN-side fallback.
  useEffect(() => { if (!serverMode && isLoaded && moveCount > 0 && pgn && !ended) { const side = toClockSide(fen); sideRef.current = side; setActiveSide(side); } }, [ended, fen, isLoaded, moveCount, pgn, serverMode]);
  useEffect(() => {
    const serverClockRunning = serverMode && Boolean(clockStartedAt);
    const legacyClockRunning = !serverMode && moveCount > 0;
    if (!isLoaded || (!serverClockRunning && !legacyClockRunning) || ended || initializedRef.current !== gameID) return;

    const id = window.setInterval(() => {
      const now = monotonicNow();
      const delta = Math.max(0, now - tickRef.current);
      tickRef.current = now;
      if (sideRef.current === "white") {
        whiteRef.current = Math.max(0, whiteRef.current - delta);
        setWhiteMs(whiteRef.current);
      } else {
        blackRef.current = Math.max(0, blackRef.current - delta);
        setBlackMs(blackRef.current);
      }
      if (!serverMode) writePersisted(gameID, { whiteMs: whiteRef.current, blackMs: blackRef.current, activeSide: sideRef.current, lastTickAt: Date.now(), moveCount, initialTimeMs });
    }, 1000);

    return () => window.clearInterval(id);
  }, [clockStartedAt, ended, gameID, initialTimeMs, isLoaded, moveCount, serverMode]);
  return { whiteMs, blackMs, activeSide, formatClockMs };
}
