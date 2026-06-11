import type { NextConfig } from "next";

const API_URL = process.env.API_URL || "http://localhost:8080";
const isDocker = process.env.DOCKER === "1";

const nextConfig: NextConfig = {
    ...(isDocker && { output: "standalone" }),
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