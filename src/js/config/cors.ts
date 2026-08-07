import type { CorsOptions } from "cors";
import { env } from "./environment.js";

const configuredOrigins = [env.VERCEL_WEB, env.CORS_ORIGINS]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

// Local Next.js development uses localhost while production origins are
// supplied through CORS_ORIGINS/VERCEL_WEB. Keep these defaults development-
// only so a missing local .env does not block the browser during development.
const localOrigins = process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"];
const allowedOrigins = [...new Set([...configuredOrigins, ...localOrigins])];

export const corsOptions: CorsOptions = {
    origin(origin, callback) {
        // Non-browser clients such as ESP32 do not send an Origin header.
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error("Origin is not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
};

export const socketCorsOptions = {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] as string[],
    credentials: false,
};
