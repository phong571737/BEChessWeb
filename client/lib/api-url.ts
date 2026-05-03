/**
 * Returns the Express backend base URL.
 *
 * Client-side: derived from the browser's current hostname so it works
 * automatically for any access IP (localhost, LAN, Tailscale, etc.)
 * without requiring NEXT_PUBLIC_* env vars to be updated.
 *
 * Server-side (SSR / rewrites): falls back to API_URL env var.
 */
export function getApiUrl(): string {
  if (typeof window === "undefined") {
    return process.env.API_URL ?? "http://localhost:8080";
  }
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8080`;
}
