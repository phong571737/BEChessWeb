/** Maps a PGN result string to a Badge variant. */
export function resultVariant(r: string): "white" | "black" | "draw" {
  if (r === "1-0") return "white";
  if (r === "0-1") return "black";
  return "draw";
}

/** Maps a PGN result string to a human-readable label. */
export function resultLabel(r: string): string {
  if (r === "1-0") return "White win";
  if (r === "0-1") return "Black win";
  if (r === "1/2-1/2") return "Draw";
  return r;
}

/** Formats an ISO date string to "dd MMM yyyy, HH:mm". Returns "N/A" for missing/invalid input. */
export function formatDateTime(src?: string | null): string {
  if (!src) return "N/A";
  const d = new Date(src);
  if (Number.isNaN(d.getTime())) return src;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Formats a duration in seconds to "HH:MM:SS". Returns "--:--:--" for null/NaN. */
export function formatDuration(sec?: number | null): string {
  if (sec == null || Number.isNaN(sec)) return "--:--:--";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Uses persisted elapsed seconds first, with timestamp recovery for legacy records. */
export function resolveDurationSeconds(
  durationSec?: number | null,
  startedAt?: string | null,
  endedAt?: string | null,
): number | null {
  if (typeof durationSec === "number" && Number.isFinite(durationSec)) return Math.max(0, Math.floor(durationSec));
  if (!startedAt || !endedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.floor((end - start) / 1_000));
}

// parse header of pgn
export function parsePgnHeader(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = pgn.split("\n");
  for (const line of lines) {
    const match = line.match(/^\[(\w+)\s+"(.*)"\]$/);
    if (match) headers[match[1]] = match[2];
    else if (line.trim() && !line.startsWith("[")) break; // moves section started
  }
  return headers;
}
