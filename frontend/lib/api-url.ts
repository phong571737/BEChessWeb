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
  if (typeof window === "undefined") {
    return process.env.API_URL ?? "http://localhost:8080";
  }
  // Build-time override for cloud deployments (Vercel → Render)
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // Auto-discovery: works for localhost, LAN, Tailscale, ngrok, etc.
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8080`;
}