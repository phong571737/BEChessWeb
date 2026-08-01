import type { NextConfig } from "next";

// Used only by the Next.js server to proxy API requests.  This must not be a
// NEXT_PUBLIC value when the frontend is served by HTTPS and the backend is
// only available over HTTP: the browser would reject that direct request as
// mixed content.  Set BACKEND_PROXY_URL in Vercel to the backend origin.
const apiUrl =
  process.env.BACKEND_PROXY_URL ||
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";
const API_URL = apiUrl.replace(/\/$/, "");
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
            { source: "/auth/:path*", destination: `${API_URL}/auth/:path*` },
            { source: "/games/:path*", destination: `${API_URL}/games/:path*` },
            { source: "/moves/:path*", destination: `${API_URL}/moves/:path*` },
            { source: "/boards", destination: `${API_URL}/boards` },
            { source: "/boards/:path*", destination: `${API_URL}/boards/:path*` },
            { source: "/eval", destination: `${API_URL}/eval` },
        ];
    }
};

export default nextConfig;
