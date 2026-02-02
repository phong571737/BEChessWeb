const { createServer } = require("http");
const { Server } = require("socket.io");
const express = require("express");
const bodyParser = require("body-parser");
const {connectDB, getMoveCollections, LoadGameFromDB, client} = require("./db");
const {Chess} = require("chess.js");
const {env} = require("./config/environment");

const game = new Chess();
const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ["https://chessweb-five.vercel.app"], //domain frontend
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(bodyParser.json());

// Connect DB
connectDB().catch(console.error);

// Get move from ESP
app.post("/move", async(req, res) =>{
  try{
    const {uci} = req.body; //uci or pgn
    console.log("Move from Esp", uci);
    
    const from = uci.slice(0, 2); // start
    const to = uci.slice(2, 4); // end

    const move = game.move({
      from, 
      to, 
      promotion: "q"
    })

    if(!move){
      return res.status(400).json({error: "Illegal move"});
    }

    const games = client.db("chess").collection("games");

    const state = {
      fen: game.fen(),
      lastMove: {
        from, 
        to, 
        uci
      },
      createdAt: new Date(),
    };

    // await moves.insertOne(doc); //insert to DB
    await games.updateOne(
      {_id: "current_game"},
      { $set: state},
      {upsert: true}
    );

    io.emit("esp_move", state);// send to web
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

httpServer.listen(env.PORT, "0.0.0.0", function () {
  console.log("Server is running at port " + env.PORT);
});