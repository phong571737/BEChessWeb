"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface User {
    id: string;
    username: string;
    email: string;
    role?: "admin" | "user" | string;
    isAdmin?: boolean;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    isAuthenticated: boolean;
    isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const isAdmin = Boolean(user?.isAdmin || user?.role === "admin");
    const router = useRouter();

    // Check for token and user in localStorage on initial load
    useEffect(() => {
        const storedToken = localStorage.getItem("token");
        const storedUser = localStorage.getItem("user");

        if (!storedToken || !storedUser || isJwtExpired(storedToken)) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            setToken(null);
            setUser(null);

            if (storedToken && isJwtExpired(storedToken)) {
                router.replace("/login");
            }
            return;
        }

        setToken(storedToken);
        try {
            setUser(JSON.parse(storedUser));
        } catch {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            setToken(null);
            setUser(null);
        }
    }, [router]);

    // Handle token expiration and logout
    useEffect(() => {
        const handleAuthExpired = () => {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            setToken(null);
            setUser(null);
            router.replace("/login");
        };

        window.addEventListener("auth:expired", handleAuthExpired);


        return () => {
            window.removeEventListener("auth:expired", handleAuthExpired);
        };
    }, [router]);

    useEffect(() => {
        if (!token) return;

        const expiryMs = getJwtExpiryMs(token);

        if (!expiryMs) {
            window.dispatchEvent(new Event("auth:expired"));
            return;
        }

        const delay = expiryMs - Date.now();

        if (delay <= 0) {
            window.dispatchEvent(new Event("auth:expired"));
            return;
        }

        const timeoutId = window.setTimeout(() => {
            window.dispatchEvent(new Event("auth:expired"));
        }, delay);

        return () => window.clearTimeout(timeoutId);
    }, [token]);

    const login = (newToken: string, newUser: User) => {
        localStorage.setItem("token", newToken);
        localStorage.setItem("user", JSON.stringify(newUser));
        setToken(newToken);
        setUser(newUser);
    };

    const logout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token, isAdmin }}>
            {children}
        </AuthContext.Provider>
    );
}

// Custom hook to access the AuthContext
function getJwtExpiryMs(token: string): number | null {
    try {
        const payloadPart = token.split(".")[1];
        if (!payloadPart) return null;

        const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/")
                                .padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");

        const payload = JSON.parse(atob(base64)) as { exp?: number };
        return typeof payload.exp === "number" ? payload.exp * 1000 : null;
    } catch {
        return null;    
    }
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return context;
}

// Check if a JWT token is expired
function isJwtExpired(token: string): boolean {
    const expiryMs = getJwtExpiryMs(token);
    return expiryMs === null || Date.now() >= expiryMs;
}
