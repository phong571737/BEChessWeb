import { Server, Socket } from "socket.io";
import { initGameSocket } from "./game.socket.js";
import { EvalSocket } from "./eval.socket.js";

let io;

export function initSocket(server){
    io = new Server(server, {
        cors:{
            origin: "*",
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    initGameSocket(io);
    EvalSocket(io);
}

export function getIO(){
    if(!io) throw new Error("Socket.io is not initalized");
    return io;
}