import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { getCurrentState } from "../game/game.manager.js";
import { GameIDPayload, ResignPayload } from "../types/game.types.js";
import { env } from "../config/environment.js";

type RequestCurrentGamePayload = Partial<GameIDPayload>;
interface MatchStatus {
    status: "ongoing" | "ended";
    winner: Exclude<ResignPayload["resignSide"], "draw"> | null;
}

const gameStatus = new Map<string, MatchStatus>();

interface SocketAuthPayload extends jwt.JwtPayload {
    role?: string;
}

function requireAdminSocket(socket: Socket): boolean {
    const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : null;
    if (!token) {
        socket.emit("action_error", { error: "Administrator authentication required" });
        return false;
    }

    try {
        const payload = jwt.verify(token, env.JWT_SECRET) as SocketAuthPayload;
        if (payload.role === "admin") return true;
    } catch {
        // Treat malformed and expired tokens identically.
    }

    socket.emit("action_error", { error: "Administrator authentication required" });
    return false;
}

export function initGameSocket(io: Server): void {
    io.on("connection", (socket) =>{

        // join room
        socket.on("join", ({gameID}) =>{
            socket.join(gameID);
        });

        // Save data to currentGameState
        socket.on('request_current_game', async (data: RequestCurrentGamePayload) => {
            if(!data || !data.gameID){
                console.log("The uploaded data is missing the gameID");
                return;
            }

            const gameID = data.gameID;
            const currentstate = await getCurrentState(gameID);

            if(currentstate){
                socket.emit("restore_game", {
                    gameID: currentstate.gameID,
                    fen: currentstate.fen,
                    lastMove: currentstate.lastMove
                });
            }else{
                console.log("No valid games found.");
            }
        });

        socket.on("resign", async ({gameID, resignSide}: ResignPayload) => {
            if (!requireAdminSocket(socket)) return;
            const current = gameStatus.get(gameID) ?? { status: "ongoing" as const, winner: null };

            // anti double click
            if(current.status === "ended") return;

            const winner: MatchStatus["winner"] = resignSide === "draw" ? null : resignSide === "white" ? "black" : "white";
            gameStatus.set(gameID, { status: "ended", winner });

            // Tự động xóa sau 60 giây để tránh leak
            setTimeout(() => {
                gameStatus.delete(gameID);
            }, 60_000);

            // notify to all client update board
            io.to(gameID).emit("update_all_game", {
                gameID,
                // resignSide
            });
        });

        // Receiv restart from client and emit update board
        socket.on("restart", ({gameID}) => {
            if (!requireAdminSocket(socket)) return;
            if (!gameID) return;

            io.to(gameID).emit("update_all_game", {
                gameID
            });
        });

        // Cleanup khi client ngắt kết nối
        socket.on("disconnect", () => {
        });
    })
}
