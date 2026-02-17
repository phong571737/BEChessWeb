import { createServer } from "http";
import express from "express";
import cors from "cors";
import { connectDB, getMoveCollections, LoadGameFromDB, client } from "./db/index.js";
import { initSocket } from "./sockets/index.js";
import { router } from "./routes/move.route.js";
import { env } from "./config/environment.js";
import path from "path";
import { fileURLToPath } from "url";
import open from "open";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // src/js

async function StartServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json());
  app.use(cors({
    origin: [
      // "https://chessweb-five.vercel.app",//domain frontend
      "http://127.0.0.1:5500",
      `http://${env.IP_LAN}:${env.PORT}`
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }));
  app.use("/move", router); //move
  app.use("/game", router); // get game/current
  app.use("/gameID", router); //gameID/create
  const html_path = path.join(__dirname, '../ServerWeb/html/index.html');
  app.use(express.static(path.join(__dirname, '..'))); // src

  app.use((req, res) => {
    res.sendFile(html_path);
  });

  // await connectDB();
  initSocket(server);

  server.listen(env.PORT, "0.0.0.0", async () => {
    console.log("Server is running on: ", env.PORT);
    // await open(`http://127.0.0.1:${env.PORT}`); 
  });
}

StartServer();