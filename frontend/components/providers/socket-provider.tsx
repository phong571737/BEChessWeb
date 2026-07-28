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
      sock = io(url, { transports: ["websocket", "polling"] });
      // Dev: log connection state and incoming socket events to help debugging
      try {
        sock.on("connect", () => {
          // eslint-disable-next-line no-console
          console.debug("[socket] connected", sock.id, "to", url);
        });
        sock.on("connect_error", (err: any) => {
          // eslint-disable-next-line no-console
          console.error("[socket] connect_error", err);
        });
        // @ts-ignore
        sock.onAny((event: string, ...args: any[]) => {
          // eslint-disable-next-line no-console
          console.debug("[socket] recv", event, args);
        });
      } catch (e) {
        // ignore in prod if onAny not available
      }
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
