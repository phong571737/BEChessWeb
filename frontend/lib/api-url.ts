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
    return process.env.API_URL ?? "http://localhost:80";
  }

  const configuredUrl = process.env.NEXT_PUBLIC_API_URL;
  const isLocalHost = (hostname: string) => hostname === "localhost" || hostname === "127.0.0.1";
  if (configuredUrl) {
    try {
      const configuredHost = new URL(configuredUrl).hostname;
      // Do not ship a localhost build setting to real VPS visitors.
      if (!isLocalHost(configuredHost) || isLocalHost(window.location.hostname)) {
        return configuredUrl.replace(/\/$/, "");
      }
    } catch {
      // Use same-origin fallback for an invalid public URL.
    }
  }

  // Auto-discovery: works for localhost, LAN, Tailscale, ngrok, etc.
  const { protocol, hostname } = window.location;
  if (
    isLocalHost(hostname) ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.endsWith(".local")
  ) {
    return `${protocol}//${hostname}:80`;
  }

  // VPS deployments use the same origin; Nginx proxies /games, /auth and
  // /socket.io to the backend outside the frontend's /chess base path.
  return window.location.origin;
}
