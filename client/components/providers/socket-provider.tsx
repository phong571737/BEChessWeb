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
      const url = getApiUrl();
      sock = io(url, { transports: ["websocket", "polling"] });
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
