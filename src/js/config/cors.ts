import type { CorsOptions } from "cors";
import { env } from "./environment.js";

const configuredOrigins = [env.VERCEL_WEB, env.CORS_ORIGINS]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

export const corsOptions: CorsOptions = {
    origin(origin, callback) {
        // Non-browser clients such as ESP32 do not send an Origin header.
        if (!origin || configuredOrigins.includes(origin)) {
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
    origin: configuredOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] as string[],
    credentials: false,
};
