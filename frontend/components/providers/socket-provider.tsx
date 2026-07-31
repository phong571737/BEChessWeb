"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { getApiUrl, getBrowserServiceUrl } from "@/lib/api-url";
import { useAuth } from "@/lib/auth-context";

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    let sock: Socket;

    import("socket.io-client").then(({ io }) => {
      const url = getBrowserServiceUrl(process.env.NEXT_PUBLIC_SOCKET_URL) ?? getApiUrl();
      // Polling works through an HTTPS tunnel that forwards to Nginx on port 80.
      // Socket.IO upgrades to WebSocket automatically when the tunnel supports it.
      sock = io(url, {
        transports: ["polling", "websocket"],
        auth: token ? { token } : undefined,
      });
      setSocket(sock);
    });

    return () => {
      sock?.disconnect();
    };
  }, [token]);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
