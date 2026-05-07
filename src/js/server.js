import { createServer } from "http";
import express from "express";
import cors from "cors";
import { getIO, initSocket } from "./sockets/index.js";
import { moveRouter } from "./routes/move.route.js";
import { env } from "./config/environment.js";
import path from "path";
import { fileURLToPath } from "url";
import { gameRouter } from "./routes/game.route.js";
import { connectDB } from "./config/database.js";
import dns from "node:dns/promises";
import { info } from "node:console";
import os from "os";
import { stockfishService } from "./services/stockfish.instance.js";
import { evalRouter } from "./routes/eval.route.js";
import { initMqtt } from "./services/mqtt.service.js";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // src/js

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
  app.use("/", evalRouter);

  const html_path = path.join(__dirname, '../ServerWeb/html/index.html');
  app.use(express.static(path.join(__dirname, '..'))); // src

  app.use((req, res) => {
    res.sendFile(html_path);
  });

  await connectDB();
  initSocket(server);
  stockfishService.init();
  initMqtt();

  // Server listen
  server.listen(env.PORT, "0.0.0.0", async () => {
    console.log("Server is running on: ", env.PORT);
  });
}

StartServer();