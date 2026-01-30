const { createServer } = require("http");
const { Server } = require("socket.io");
const express = require("express");
const bodyParser = require("body-parser");
const {connectDB, getMoveCollections} = require("./db")
const PORT = process.env.PORT || 8080;

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ["https://chessweb-five.vercel.app"], //domain frontend
    methods: ["POST"],
    credentials: true
  }
});

app.use(bodyParser.json());

// Connect DB
connectDB().catch(console.error);

// Get move from ESP
app.post("/move", (req, res) =>{
  try{
    const data = req.body; //uci or pgn
    console.log("Move from Esp", data);

    const moves = getMoveCollections();

    const doc = {
      ...data, 
      createdAt: new Date(),
    };

    io.emit("esp_move", data);// send to web
    res.json({
      status: "ok"
    })
  }catch (err){
    console.error(err);
  }
})

io.on("connection", (socket) => {
  socket.emit('i am connected');
});

// httpServer.listen(PORT, "0.0.0.0", function () {
//   console.log("Server is running at port " + PORT);
// });