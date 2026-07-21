import dotenv from "dotenv";
import mqtt from "mqtt";

dotenv.config();

function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const url = requireEnv("URL_HIVEMQTT");
const options = {
  username: requireEnv("MQTT_USER"),
  password: requireEnv("MQTT_PASSWORD"),
};

const client = mqtt.connect(url, options);
client.on("connect", () => {
  console.log("[mqtt-test] connected to broker");
  const topic = "chess/Board_01/status";
  const msg = JSON.stringify({ status: "offline" });
  client.publish(topic, msg, { qos: 1 }, (err) => {
    if (err) console.error("[mqtt-test] publish err", err);
    else console.log("[mqtt-test] published", topic, msg);
    client.end();
  });
});
client.on("error", (e) => console.error("[mqtt-test] error", e));
