/**
 * Returns the Express backend base URL.
 *
 * Priority (client-side):
 *   1. NEXT_PUBLIC_API_URL  — set at build time for cloud deployments (Vercel + Render)
 *   2. Auto-discovery       — derives from window.location.hostname for LAN / local / VPN
 *
 * Server-side (SSR / rewrites): uses API_URL env var.
 */
const isLocalHost = (hostname: string) => hostname === "localhost" || hostname === "127.0.0.1";

/**
 * Returns a browser-facing service URL while preventing a stale build-time
 * protocol from creating mixed content on the same deployed domain.
 */
export function getBrowserServiceUrl(configuredUrl?: string): string | null {
  if (typeof window === "undefined" || !configuredUrl) return null;

  try {
    const configured = new URL(configuredUrl);
    const currentHost = window.location.hostname;

    // Do not ship a localhost build setting to real VPS visitors.
    if (isLocalHost(configured.hostname) && !isLocalHost(currentHost)) return null;

    // The VPS proxies browser services on the current domain. Keep the page
    // protocol when an outdated build value differs only by HTTP vs HTTPS.
    if (configured.hostname === currentHost && configured.protocol !== window.location.protocol) {
      return window.location.origin;
    }

    return configuredUrl.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function getApiUrl(): string {
  if (typeof window === "undefined") {
    return process.env.API_URL ?? "http://localhost:80";
  }

  const configuredUrl = getBrowserServiceUrl(process.env.NEXT_PUBLIC_API_URL);
  if (configuredUrl) return configuredUrl;

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
