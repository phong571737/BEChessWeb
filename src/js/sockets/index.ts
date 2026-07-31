import { Server } from "socket.io";
import { Server as HTTPServer } from "http";
import { initGameSocket } from "./game.socket.js";
import { socketCorsOptions } from "../config/cors.js";

let io: Server | undefined;

export function initSocket(server: HTTPServer): void{
    io = new Server(server, {
        cors: socketCorsOptions,
    });

    initGameSocket(io);
}

export function getIO(){
    if(!io) throw new Error("Socket.io is not initalized");
    return io;
}
