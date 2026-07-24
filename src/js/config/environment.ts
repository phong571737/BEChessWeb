import dotenv from "dotenv";

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Reads an optional env var, returns undefined if missing
function optionalEnv(key: string): string | undefined {
  return process.env[key];
}

export interface Env {
  MONGO_URI: string;
  AUTHOR?: string;
  PORT: number;
  SERVER_NAME?: string;
  URL_HIVEMQTT: string;
  MQTT_USER?: string;
  MQTT_PASSWORD?: string;
  MQTT_PORT: number;
  MQTT_TOPIC_GET_IP?: string;
  MONGO_LOCAL?: string;
  ADMIN_USERNAME?: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
}

export const env: Env = {
  MONGO_URI: requireEnv("MONGO_URI"),
  AUTHOR: optionalEnv("AUTHOR"),
  PORT: Number(requireEnv("PORT")),
  SERVER_NAME: optionalEnv("SERVER_NAME"),
  URL_HIVEMQTT: requireEnv("URL_HIVEMQTT"),
  MQTT_USER: optionalEnv("MQTT_USER"),
  MQTT_PASSWORD: optionalEnv("MQTT_PASSWORD"),
  MQTT_PORT: Number(requireEnv("MQTT_PORT")),
  MQTT_TOPIC_GET_IP: optionalEnv("MQTT_TOPIC_GET_IP"),
  MONGO_LOCAL: optionalEnv("MONGO_LOCAL"),
  ADMIN_USERNAME: optionalEnv("ADMIN_USERNAME"),
  ADMIN_EMAIL: optionalEnv("ADMIN_EMAIL"),
  ADMIN_PASSWORD: optionalEnv("ADMIN_PASSWORD"),
};