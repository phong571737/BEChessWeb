import dotenv from "dotenv";

dotenv.config();

export const env = {
    MONGO_URI: process.env.MONGO_URI,
    AUTHOR: process.env.AUTHOR,
    PORT: process.env.PORT,
    SERVER_NAME: process.env.SERVER_NAME,
    URL_HIVEMQTT: process.env.URL_HIVEMQTT,
    MQTT_USER: process.env.MQTT_USER,
    MQTT_PASSWORD: process.env.MQTT_PASSWORD,
    MQTT_PORT: process.env.MQTT_PORT,
    MQTT_TOPIC_GET_IP: process.env.MQTT_TOPIC_GET_IP,
    MONGO_LOCAL: process.env.MONGO_LOCAL, 
}