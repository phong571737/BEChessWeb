import { createServer } from "http";
import { setServers as dnsSetServers } from "node:dns/promises";
import express from "express";
import cors from "cors";
import os from "os";

dnsSetServers(["1.1.1.1", "8.8.8.8"]);
import { connectDB } from "./config/database.js";
import { env, ALLOWED_ORIGINS } from "./config/environment.js";
import { initSocket } from "./sockets/index.js";
import { stockfishService } from "./services/stockfish.instance.js";
import { gameRouter } from "./routes/game.route.js";
import { moveRouter } from "./routes/move.route.js";
import { evalRouter } from "./routes/eval.route.js";
import { boardRouter } from "./routes/board.route.js";

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  if (interfaces["Wi-Fi"]) {
    for (const iface of interfaces["Wi-Fi"]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  for (const ifaces of Object.values(interfaces)) {
    for (const iface of ifaces) {
      if (iface.family === "IPv4" && !iface.internal && !iface.address.startsWith("192.168.56."))
        return iface.address;
    }
  }
  return "127.0.0.1";
}

async function startServer() {
  const app    = express();
  const server = createServer(app);

  app.use(cors({
    origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : "*",
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (_, res) => res.json({ ok: true }));

  app.use("/games",  gameRouter);
  app.use("/moves",  moveRouter);
  app.use("/boards", boardRouter);
  app.use("/",       evalRouter);

  try {
    await connectDB();
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }

  initSocket(server);
  stockfishService.init();

  server.listen(env.PORT, "0.0.0.0", () => {
    const ip = getLocalIp();
    console.log(`Express running on:`);
    console.log(`  Local:   http://localhost:${env.PORT}`);
    console.log(`  Network: http://${ip}:${env.PORT}`);
  });
}

startServer();
