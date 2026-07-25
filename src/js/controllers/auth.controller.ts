import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { createUser, findUserByEmail, validatePassword } from "../models/user.model.js";

const getJwtSecret = () => process.env.JWT_SECRET || "your-secret-key";

export const AuthController = {
    async register(req: Request, res: Response): Promise<void> {
        try {
            const { username, email, password } = req.body;

            if (!username || !email || !password) {
                res.status(400).json({ error: "Missing required fields" });
                return;
            }

            const existingUser = await findUserByEmail(email);
            if (existingUser) {
                res.status(409).json({ error: "Email already exists" });
                return;
            }

            const user = await createUser(username, email, password);
            if (!user) {
                res.status(500).json({ error: "Failed to create user" });
                return;
            }

            const token = jwt.sign(
                { userId: user._id, email: user.email, role: user.role ?? "user" },
                getJwtSecret(),
                { expiresIn: "7d" }
            );

            res.status(201).json({
                token,
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role ?? "user",
                    isAdmin: user.role === "admin",
                },
            });
        } catch (error) {
            console.error("Register error:", error);
            res.status(500).json({ error: "Registration failed" });
        }
    },

    async login(req: Request, res: Response): Promise<void> {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                res.status(400).json({ error: "Email and password required" });
                return;
            }

            const user = await findUserByEmail(email);
            if (!user) {
                res.status(401).json({ error: "Invalid credentials" });
                return;
            }

            const isValid = await validatePassword(password, user.password);
            if (!isValid) {
                res.status(401).json({ error: "Invalid credentials" });
                return;
            }

            const token = jwt.sign(
                { userId: user._id, email: user.email, role: user.role ?? "user" },
                getJwtSecret(),
                { expiresIn: "7d" }
            );

            res.json({
                token,
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role ?? "user",
                    isAdmin: user.role === "admin",
                },
            });
        } catch (error) {
            console.error("Login error:", error);
            res.status(500).json({ error: "Login failed" });
        }
    },
};
