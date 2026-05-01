import mqtt from "mqtt";
import { env } from "../config/environment.js";
import { getIO } from "../sockets/index.js";
import { updateNotify } from "../../ServerWeb/js/core/notify.manager.js";
import { emitGameState, gameState } from "../game/game.state.js";

let mqttClient = null;

// This function is used to handle message
function handleMessage(topic, message) {
    const parts = topic.split('/');

    if (parts.length === 3 && parts[0] === 'chess' && parts[2] === 'status') {
        const gameID = parts[1];
        try {
            const payload = JSON.parse(message.toString());

            // if status is online(board connected)
            if (payload.status === 'online') {
                console.log(`[MQTT] Board ${gameID} online`);
                gameState.set(gameID, {boardStatus: "online"});
            } else if (payload.status === 'offline') { // board disconnected(power outage)
                console.log(`[MQTT] Board ${gameID} offline`);
                gameState.set(gameID, {boardStatus: "offline"});
            }

            emitGameState(gameID);
        } catch (e) {
            console.log("[MQTT] Parse message error: ", e);
        }
    }
}

// init mqtt
export function initMqtt() {
    // MQTT
    const MqttOptions = {
        port: env.MQTT_PORT,
        username: env.MQTT_USER,
        password: env.MQTT_PASSWORD,
    };

    const brokerURL = env.URL_HIVEMQTT;
    mqttClient = mqtt.connect(brokerURL, MqttOptions);

    mqttClient.on('connect', () => {
        console.log("Connect to broker successfully!");

        // subcribe status to broker
        mqttClient.subscribe("chess/+/status", {qos: 1}, (err) => {
          if (err) {
            console.error("[MQTT] Subscribe failed:", err);
          } else {
            console.log(`[MQTT] Subscribed to chess/+/status`);
          }
        })
    })

    mqttClient.on('message', handleMessage); // handle message on and off

    mqttClient.on('error', (err) => {
        console.error("[MQTT] error connect:", err);
    });
}

export function getMqttClient() {
    return mqttClient;
}