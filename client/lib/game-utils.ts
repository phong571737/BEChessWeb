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
