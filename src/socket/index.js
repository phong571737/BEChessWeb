const { Server, Socket } = require("socket.io");

let io;

function initSocket(server){
    io = new Server(server, {
        cors:{
            origin: ["https://chessweb-five.vercel.app"], //domain frontend
            credentials: true
        }
    });

    io.on("connection", socket =>{
        console.log("Web connected", socket.id);
    })
}

function getIO(){
    if(!io) throw new Error("Socket.io is not initalized");
    return io;
}

module.exports = {initSocket, getIO};