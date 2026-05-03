import { Server, Socket } from "socket.io";
import { initGameSocket } from "./game.socket.js";
import { EvalSocket } from "./eval.socket.js";

let io;

export function initSocket(server) {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",").map(s => s.trim());
    io = new Server(server, {
        cors: {
            origin: allowedOrigins,
            methods: ["GET", "POST"],
            credentials: true
        }
    });

    initGameSocket(io);
    EvalSocket(io);
}

export function getIO() {
    if (!io) throw new Error("Socket.io not initialized");
    return io;
}