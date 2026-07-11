import { createServer } from "http";
import express from "express";
import cors from "cors";
import { initSocket } from "./sockets/index.js";
import { connectDB } from "./config/database.js";
import dns from "node:dns/promises";
import { evalRouter } from "./routes/eval.router.js";
import { initMqtt } from "./services/mqtt.service.js";
import { boardRouter } from "./routes/board.router.js";
import { gameRouter } from "./routes/game.router.js";
import { moveRouter } from "./routes/move.router.js";
import { env } from "./config/environment.js";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

async function StartServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cors({
    origin: "*",
    methods: ['GET', 'POST'],
    credentials: true
  }));

  app.use("/moves", moveRouter); //moves
  app.use("/games", gameRouter); // get games/current and games
  app.use("/boards", boardRouter); // create a new board
  app.use("/", evalRouter);

  await connectDB();
  initSocket(server);
  // stockfishService.init();
  initMqtt();

  // Server listen
  server.listen( Number(env.PORT), "0.0.0.0", async () => {
    console.log("Server is running on: ", env.PORT);
  });
}

StartServer();