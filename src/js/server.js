import { createServer } from "http";
import express from "express";
import cors from "cors";
import { initSocket } from "./sockets/index.js";
import { moveRouter } from "./routes/move.route.js";
import { env } from "./config/environment.js";
import path from "path";
import { fileURLToPath } from "url";
import open from "open";
import expressListEndpoints from "express-list-endpoints";
import { gameRouter } from "./routes/game.route.js";
import { connectDB } from "./config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // src/js

async function StartServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json());
  app.use(express.urlencoded({extended:true}));
  app.use(cors({
    origin: [
      // "https://chessweb-five.vercel.app",//domain frontend
      "http://127.0.0.1:5500",
      `http://${env.IP_LAN}:${env.PORT}`
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }));
  app.use("/moves", moveRouter); //moves
  app.use("/games", gameRouter); // get games/current and games
  
  const html_path = path.join(__dirname, '../ServerWeb/html/index.html');
  app.use(express.static(path.join(__dirname, '..'))); // src

  app.use((req, res) => {
    res.sendFile(html_path);
  });

  await connectDB();
  initSocket(server);

  const endpoints = expressListEndpoints(app);
  console.log("Endpoints: ",endpoints);
  server.listen(env.PORT, "0.0.0.0", async () => {
    console.log("Server is running on: ", env.PORT);
    // await open(`http://127.0.0.1:${env.PORT}`); 
  });
}

StartServer();