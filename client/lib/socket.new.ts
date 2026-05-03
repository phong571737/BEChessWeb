import type { Socket } from "socket.io-client";

let _socket: Socket | null = null;
let _connecting: Promise<Socket> | null = null;

export async function getSocket(): Promise<Socket> {
  if (_socket?.connected) return _socket;
  if (_connecting) return _connecting;

  _connecting = (async () => {
    const { io } = await import("socket.io-client");
    const url =
      (typeof window !== "undefined" && process.env.NEXT_PUBLIC_SOCKET_URL) ||
      "http://localhost:8080";

    _socket = io(url, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });

    await new Promise<void>((resolve, reject) => {
      _socket!.on("connect", resolve);
      _socket!.on("connect_error", reject);
      setTimeout(() => reject(new Error("Socket connection timeout")), 10000);
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
