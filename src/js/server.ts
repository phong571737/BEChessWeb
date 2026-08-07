import { createServer } from "http";
import express from "express";
import cors from "cors";
import { initSocket } from "./sockets/index.js";
import { connectDB } from "./config/database.js";
// import { evalRouter } from "./routes/eval.router.js";
import { initMqtt } from "./services/mqtt.service.js";
import { boardRouter } from "./routes/board.router.js";
import { gameRouter } from "./routes/game.router.js";
import { recoverRouter } from "./routes/recover.router.js";
import { moveRouter } from "./routes/move.router.js";
import authRouter from "./routes/auth.router.js";
import { env } from "./config/environment.js";
import { ensureDefaultAdmin, ensureDefaultUser } from "./models/user.model.js";
import { corsOptions } from "./config/cors.js";
import { restoreActiveGamesFromDB } from "./game/game.manager.js";

async function StartServer() {
  const app = express();
  const server = createServer(app);

  // Nginx is the single reverse proxy in front of this service.
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cors(corsOptions));
  
    // Simple health endpoint: GET /
    app.get("/", (req, res) => {
      res.json({ ok: true, message: "Chess API running" });
    });

  app.get("/health", (req, res) => res.status(200).send("OK"));
  app.use("/moves", moveRouter); //moves
  app.use("/games", recoverRouter);
  app.use("/games", gameRouter); // get games/current and games
  app.use("/boards", boardRouter); // create a new board
  app.use("/auth", authRouter); // auth routes
  // app.use("/", evalRouter);

  await connectDB();
  const restoredGames = await restoreActiveGamesFromDB();
  if (restoredGames) console.log(`Restored ${restoredGames} active game session(s) from MongoDB`);
  if (env.ADMIN_USERNAME && env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    await ensureDefaultAdmin(env.ADMIN_USERNAME, env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  }
  if (env.USER_USERNAME && env.USER_EMAIL && env.USER_PASSWORD) {
    await ensureDefaultUser(env.USER_USERNAME, env.USER_EMAIL, env.USER_PASSWORD);
  }
  initSocket(server);
  // stockfishService.init();
  initMqtt();

  // Server listen
  server.listen( Number(env.PORT), "0.0.0.0", async () => {
    console.log("Server is running on: ", env.PORT);
  });
}

StartServer();
