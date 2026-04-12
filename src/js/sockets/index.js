import { Server, Socket } from "socket.io";
import { getCurrentState, makeMove } from "../game/game.manager.js";

let io;

export function initSocket(server){
    io = new Server(server, {
        cors:{
            origin: "*",
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    io.on("connection", (socket) =>{
        socket.on('request_current_game', (data)=>{
            if(!data || !data.gameID){
                console.log("The uploaded data is missing the gameID");
                return;
            }

            const gameID = data.gameID;
            const currentstate = getCurrentState(gameID);
            
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

        // Save data to currentGameState 
        socket.on("esp_move", (data)=>{
            try{
                const moveResult = makeMove(data.gameID, data.uci);

                io.emit("esp_move", {
                    gameID: moveResult.gameID,
                    lastMove: moveResult.lastMove,
                    fen: moveResult.fen
                });
                console.log("Save data to RAM:", moveResult.lastMove);
            }catch(err){
                console.error("Move failed: ", err.message);
            }
        });

        socket.on("join", ({gameID}) =>{
            socket.join(gameID);
            console.log(`${socket.id} joined room: ${gameID}`);
        })
    })
}

export function getIO(){
    if(!io) throw new Error("Socket.io is not initalized");
    return io;
}