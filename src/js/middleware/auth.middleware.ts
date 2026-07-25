import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

interface AuthPayload extends jwt.JwtPayload {
    role?: string;
}

const getJwtSecret = () => process.env.JWT_SECRET || "your-secret-key";

/** Restricts state-changing administrator operations to a valid admin JWT. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    const authorization = req.header("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

    if (!token) {
        res.status(401).json({ error: "Authentication required" });
        return;
    }

    try {
        const payload = jwt.verify(token, getJwtSecret()) as AuthPayload;
        if (payload.role !== "admin") {
            res.status(403).json({ error: "Administrator access required" });
            return;
        }
        next();
    } catch {
        res.status(401).json({ error: "Invalid or expired authentication token" });
    }
}
