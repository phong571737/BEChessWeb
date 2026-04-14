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
        // join room
        socket.on("join", ({gameID}) =>{
            socket.join(gameID);
            console.log(`${socket.id} joined room: ${gameID}`);
        });

        // Save data to currentGameState
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
 
        socket.on("esp_move", (data)=>{
            try{
                if (!data?.gameID || !data?.uci) return;

                const moveResult = makeMove(data.gameID, data.uci);

                io.to(data.gameID).emit("esp_move", {
                    gameID: moveResult.gameID,
                    lastMove: moveResult.lastMove,
                    fen: moveResult.fen
                });
                console.log("Save data to RAM:", moveResult.lastMove);
            }catch(err){
                console.error("Move failed: ", err.message);
            }
        });

        socket.on("resign", ({gameID, resignSide}) => {
            const game = getCurrentState(gameID);

            // anti double click
            if(game?.status === "ended") return;

            game.status = "ended";
            game.winner = resignSide === "white" ? "black" : "white";

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
        })
    })
}

export function getIO(){
    if(!io) throw new Error("Socket.io is not initalized");
    return io;
}