import { Server } from "socket.io";
import { getCurrentState } from "../game/game.manager.js";
import { GameIDPayload, ResignPayload } from "../types/game.types.js";

type RequestCurrentGamePayload = Partial<GameIDPayload>;
interface MatchStatus {
    status: "ongoing" | "ended";
    winner: Exclude<ResignPayload["resignSide"], "draw"> | null;
}

const gameStatus = new Map<string, MatchStatus>();

export function initGameSocket(io: Server): void {
    io.on("connection", (socket) =>{

        // join room
        socket.on("join", ({gameID}) =>{
            socket.join(gameID);
            console.log(`${socket.id} joined room: ${gameID}`);
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
            if (!gameID) return;
            
            io.to(gameID).emit("update_all_game", {
                gameID
            });
        });

        // Cleanup khi client ngắt kết nối
        socket.on("disconnect", () => {
            console.log(`Socket ${socket.id} disconnected`);
        });
    })
}