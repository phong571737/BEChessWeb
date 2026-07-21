/**
 * Returns the Express backend base URL.
 *
 * Priority (client-side):
 *   1. NEXT_PUBLIC_API_URL  — set at build time for cloud deployments (Vercel + Render)
 *   2. Auto-discovery       — derives from window.location.hostname for LAN / local / VPN
 *
 * Server-side (SSR / rewrites): uses API_URL env var.
 */
export function getApiUrl(): string {
  // Build-time / runtime override via environment variables
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  if (typeof window === "undefined") {
    return process.env.API_URL ?? "http://localhost:8080";
  }

  // Auto-discovery: works for localhost, LAN, Tailscale, ngrok, etc.
  const { protocol, hostname } = window.location;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.endsWith(".local")
  ) {
    return `${protocol}//${hostname}:8080`;
  }

  return process.env.API_URL ?? "http://localhost:8080";
}