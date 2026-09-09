import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/environment.js";

export interface AuthPayload extends jwt.JwtPayload {
    role?: string;
}

export interface OptionalAuthRequest extends Request {
    auth?: AuthPayload;
}

/** Reads a JWT when present while keeping public read endpoints accessible. */
export function optionalAuth(req: OptionalAuthRequest, _res: Response, next: NextFunction): void {
    const authorization = req.header("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    if (!token) {
        next();
        return;
    }
    try {
        req.auth = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    } catch {
        // Invalid optional credentials receive the same delayed public view as guests.
    }
    next();
}

/** Requires a valid JWT for authenticated user actions. */
export function requireAuthenticated(req: Request, res: Response, next: NextFunction): void {
    const authorization = req.header("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

    if (!token) {
        res.status(401).json({ error: "Authentication required" });
        return;
    }

    try {
        jwt.verify(token, env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: "Invalid or expired authentication token" });
    }
}

/** Restricts state-changing administrator operations to a valid admin JWT. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    const authorization = req.header("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

    if (!token) {
        res.status(401).json({ error: "Authentication required" });
        return;
    }

    try {
        const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
        if (payload.role !== "admin") {
            res.status(403).json({ error: "Administrator access required" });
            return;
        }
        next();
    } catch {
        res.status(401).json({ error: "Invalid or expired authentication token" });
    }
}
