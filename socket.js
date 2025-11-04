const { createServer } = require("http");
const { Server } = require("socket.io");
const express = require("express");
const bodyParses = require("body-parser")
const PORT = 3000

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

app.use(bodyParses.json());

app.post("/move", (req, res) =>{
  const data = req.body; //uci or pgn
  console.log("Move from pico", data);

  io.emit("pico_move", data);// send to web
  res.json({
    status: "ok"
  })
})

io.on("connection", (socket) => {
  socket.emit('i am connected');

});

httpServer.listen(PORT, "0.0.0.0", function () {
  console.log("Server is running at port " + PORT);
});