import type { NextConfig } from "next";

// Express backend URL — used only by Next.js server-side rewrites.
// In Docker this is set to http://server:8080 (internal network) via ARG/ENV.
// Locally it falls back to localhost:8080.
const API_URL = process.env.API_URL || "http://localhost:8080";

const isDocker = process.env.DOCKER === "1";

const nextConfig: NextConfig = {
  // standalone mode + monorepo tracing root: needed for Docker self-hosted only.
  // On Vercel (deployed from client/) these cause a doubled output path, so skip.
  ...(isDocker && {
    output: "standalone",
    outputFileTracingRoot: require("path").join(__dirname, ".."),
  }),
  async rewrites() {
    return [
      { source: "/fen",           destination: `${API_URL}/fen` },
      { source: "/games/:path*",  destination: `${API_URL}/games/:path*` },
      { source: "/moves/:path*",  destination: `${API_URL}/moves/:path*` },
      { source: "/boards",        destination: `${API_URL}/boards` },
      { source: "/boards/:path*", destination: `${API_URL}/boards/:path*` },
      { source: "/eval",          destination: `${API_URL}/eval` },
    ];
  },
};

export default nextConfig;
