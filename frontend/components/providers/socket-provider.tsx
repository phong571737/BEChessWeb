"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { getApiUrl } from "@/lib/api-url";

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    let sock: Socket;

    import("socket.io-client").then(({ io }) => {
      const configuredSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
      const url = configuredSocketUrl && (!configuredSocketUrl.includes("localhost") || window.location.hostname === "localhost")
        ? configuredSocketUrl
        : getApiUrl();
      // Polling works through an HTTPS tunnel that forwards to Nginx on port 80.
      // Socket.IO upgrades to WebSocket automatically when the tunnel supports it.
      sock = io(url, { transports: ["polling", "websocket"] });
      setSocket(sock);
    });

    return () => {
      sock?.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
