const { createServer } = require("http");
const { Server } = require("socket.io");
const express = require("express");
const bodyParses = require("body-parser");
const PORT = process.env.PORT || 8080;

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ["https://chessweb-five.vercel.app"], //domain frontend
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(bodyParses.json());

app.post("/move", express.text({type: '*/*'}), (req, res) =>{
  console.log("=== /move RECEIVED ===");
  console.log("Headers:", req.headers);
  console.log("RawBody:", req.body);
  try{
    const data = JSON.parse(req.body); //uci or pgn
    console.log("Parse", data);
  }
  catch(e){
    console.log("JSON parse error:", e);
  }

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