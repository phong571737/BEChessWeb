import type { NextConfig } from "next";

const API_URL =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";
const isDocker = process.env.DOCKER === "1";
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

const nextConfig: NextConfig = {
    ...(isDocker && { output: "standalone" }),
    ...(basePath && { basePath }),
    // The VPS serves the app below /chess. Disabling optimization avoids an
    // internal /_next/image fetch for public assets that loses that subpath.
    images: { unoptimized: true },
    // outputFileTracingRoot: require("path").join(__dirname, ".."),
    async rewrites() {
        return [
            { source: "/games/:path*", destination: `${API_URL}/games/:path*` },
            { source: "/moves/:path*", destination: `${API_URL}/moves/:path*` },
            { source: "/boards", destination: `${API_URL}/boards` },
            { source: "/boards/:path*", destination: `${API_URL}/boards/:path*` },
            { source: "/eval", destination: `${API_URL}/eval` },
        ];
    }
}

export default nextConfig;
