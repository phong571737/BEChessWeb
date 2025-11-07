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

app.post("/move", express.text({type: '*/*'}), (req, res) => {
  console.log("=== /move RECEIVED ===");
  console.log("RawBody:", req.body);

  let data = null;
  try {
    data = JSON.parse(req.body);
    console.log("Parsed:", data);
  } catch (e) {
    console.log("JSON parse error:", e);
    return res.status(400).json({ error: "Invalid JSON" });
  }

  io.emit("pico_move", data);
  res.json({ status: "ok" });
});

io.on("connection", (socket) => {
  socket.emit('i am connected');
});

httpServer.listen(PORT, "0.0.0.0", function () {
  console.log("Server is running at port " + PORT);
});