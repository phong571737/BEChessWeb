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
import mqtt from "mqtt";
import { stockfishService } from "./services/stockfish.instance.js";
import { evalRouter } from "./routes/eval.route.js";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // src/js

function getLocalIp() {
  const interfaces = os.networkInterfaces();

  if (interfaces["Wi-Fi"]) {
    for (const iface of interfaces["Wi-Fi"]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('192.168.56.')) {
        return iface.address;
      }
    }
  }

  return '127.0.0.1';
}

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

  // const localIP = getLocalIp();
  // console.log("local ip: ", localIP);

  // // MQTT
  // const MqttOptions = {
  //   port: env.MQTT_PORT,
  //   username: env.MQTT_USER,
  //   password: env.MQTT_PASSWORD
  // };

  // const brokerURL = env.URL_HIVEMQTT;
  // const mqttClient = mqtt.connect(brokerURL, MqttOptions);

  // mqttClient.on('connect', () => {
  //   console.log("Connect to broker successfully!");
  //   const topic = env.MQTT_TOPIC_GET_IP;

  //   // publish ip to broker
  //   mqttClient.publish(topic, localIP, {retain: true, qos: 1}, (err) => {
  //     if (err) {
  //       console.error("Error when send ip to broker: ", err);
  //     } else {
  //       console.log(`Send ip ${localIP} to topic`);
  //     }
  //   })
  // })

  // mqttClient.on('error', (err) => {
  //   console.error("[MQTT] error connect:", err);
  // });

  // Server listen
  server.listen(env.PORT, "0.0.0.0", async () => {
    console.log("Server is running on: ", env.PORT);
  });
}

StartServer();