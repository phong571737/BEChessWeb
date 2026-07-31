import type { NextFunction, Request, RequestHandler, Response } from "express";

type RateLimitOptions = {
    key: string;
    max: number;
    windowMs: number;
};

type RateLimitBucket = {
    count: number;
    resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

function getClientAddress(req: Request): string {
    return req.ip || req.socket.remoteAddress || "unknown";
}

/**
 * Lightweight in-memory limiter for public API routes.
 * It is intentionally scoped per route group and IP so normal board polling
 * and ESP move traffic remain unaffected.
 */
export function rateLimit({ key, max, windowMs }: RateLimitOptions): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
        const now = Date.now();
        const bucketKey = `${key}:${getClientAddress(req)}`;
        const current = buckets.get(bucketKey);

        if (!current || now >= current.resetAt) {
            buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
            next();
            return;
        }

        if (current.count >= max) {
            const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1_000));
            res.setHeader("Retry-After", String(retryAfter));
            res.status(429).json({ error: "Too many requests. Please try again later." });
            return;
        }

        current.count += 1;
        next();
    };
}

export const authLoginRateLimit = rateLimit({ key: "auth-login", max: 5, windowMs: 60_000 });
export const authRegisterRateLimit = rateLimit({ key: "auth-register", max: 5, windowMs: 60 * 60_000 });
export const moveRateLimit = rateLimit({ key: "moves", max: 120, windowMs: 60_000 });
export const boardCreateRateLimit = rateLimit({ key: "board-create", max: 10, windowMs: 60_000 });
export const boardInitCheckRateLimit = rateLimit({ key: "board-initcheck", max: 240, windowMs: 60_000 });
export const gameReadRateLimit = rateLimit({ key: "game-read", max: 120, windowMs: 60_000 });
export const gameInitCheckRateLimit = rateLimit({ key: "game-initcheck", max: 240, windowMs: 60_000 });
export const gameMutationRateLimit = rateLimit({ key: "game-mutation", max: 20, windowMs: 60_000 });
export const gameDestructiveRateLimit = rateLimit({ key: "game-destructive", max: 5, windowMs: 60_000 });
