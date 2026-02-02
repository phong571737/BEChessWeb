const { Server, Socket } = require("socket.io");

let io;

function initSocket(server){
    io = new Server(server, {
        cors:{
            origin: ["https://chessweb-five.vercel.app"], //domain frontend
        }
    });

    io.on("connection", socket =>{
        console.log("Web connected");
    })
}

module.exports = {initSocket, io};