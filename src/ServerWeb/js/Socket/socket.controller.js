import { GameCard } from "/ServerWeb/js/components/gamecard.js";
import { BoardUI } from "/ServerWeb/js/Board/board.ui.js";
import { GameController } from "/ServerWeb/js/Game/game.controller.js";

export const SocketController = {
    socket: null,

    async init() {
        this.socket = io();

        //Create New Game
        this.socket.on("create_game", (data)=>{
            console.log("Create game from server:", data);

            if(data && data.gameID){
                GameCard.addGame(data.gameID);
            }
        });

        // Listen to restore data from server
        this.socket.on("restore_game", (data) =>{
            document.dispatchEvent(
                new CustomEvent("socket:restore", {detail: data})
            );
        });
        
        this.socket.on("esp_move", (data) =>{
            document.dispatchEvent(
                new CustomEvent("socket:move", {detail:data})
            );
        });

        //F5=> request the current state
        this.socket.on("connect", ()=>{
            const path = window.location.pathname;
            console.log("Path: ", path);
            if(path.startsWith("/Board_")){
                const gameID = `Board_${path.split("_")[1]}`;
                console.log("Requesting restore for:", gameID);
                this.socket.emit("request_current_game", {gameID: gameID});
            }
        });

        this.socket.on("connect_error", (err)=>{
            console.error("Connection Error: ", err);
        })
    },
};