/**
 * Singleton socket instance.
 * Initialised lazily client-side; do NOT import at module top-level in
 * Server Components — only use inside useEffect / 'use client' files.
 */
import type { Socket } from "socket.io-client";
import { getApiUrl, getBrowserServiceUrl } from "./api-url";

let _socket: Socket | null = null;
let _connecting: Promise<Socket> | null = null;

export async function getSocket(): Promise<Socket> {
  if (_socket?.connected) return _socket;
  if (_connecting) return _connecting;

  _connecting = (async () => {
    const { io } = await import("socket.io-client");
    // If NEXT_PUBLIC_SOCKET_URL is set at build time, use it.
    // Otherwise fallback to getApiUrl() which handles local vs deployed Render backend.
    const url = getBrowserServiceUrl(process.env.NEXT_PUBLIC_SOCKET_URL) ?? getApiUrl();

    _socket = io(url, {
      // Start with HTTP polling so TLS-terminating tunnels that only expose
      // port 80 upstream can connect before attempting a WebSocket upgrade.
      transports: ["polling", "websocket"],
      autoConnect: true,
    });

    await new Promise<void>((resolve, reject) => {
      _socket!.once("connect", resolve);
      _socket!.once("connect_error", reject);
    });

    _connecting = null;
    return _socket;
  })();

  return _connecting;
}

export function disconnectSocket() {
  _socket?.disconnect();
  _socket = null;
  _connecting = null;
}
