const { createServer } = require("http");
const express = require("express");
const {connectDB, getMoveCollections, LoadGameFromDB, client} = require("./db");
const {initSocket} = require("./socket");
const {router} = require("./routes/move.route");
const {env} = require("./config/environment");

async function StartServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json());
  app.use("/move", router);
  app.use("/game", router); // get game/current

  await connectDB();
  initSocket(server);

  server.listen(env.PORT, ()=>{
    console.log("Server is running on: ", env.PORT);
  });
}

StartServer();