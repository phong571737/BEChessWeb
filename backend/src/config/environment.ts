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
  /** Mandatory signing key for authentication tokens. */
  JWT_SECRET: string;
  /** Comma-separated browser origins permitted for cross-origin API requests. */
  CORS_ORIGINS?: string;
  VERCEL_WEB?: string;
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
  USER_USERNAME?: string;
  USER_EMAIL?: string;
  USER_PASSWORD?: string;
  /** Internal URL of the optional Python FEN recovery sidecar. */
  RECOVER_SERVICE_URL?: string;
}

export const env: Env = {
  MONGO_URI: requireEnv("MONGO_URI"),
  JWT_SECRET: requireEnv("JWT_SECRET"),
  CORS_ORIGINS: optionalEnv("CORS_ORIGINS"),
  VERCEL_WEB: optionalEnv("VERCEL_WEB"),
  AUTHOR: optionalEnv("AUTHOR"),
  PORT: Number(optionalEnv("PORT") ?? "80"),
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
  USER_USERNAME: optionalEnv("USER_USERNAME"),
  USER_EMAIL: optionalEnv("USER_EMAIL"),
  USER_PASSWORD: optionalEnv("USER_PASSWORD"),
  RECOVER_SERVICE_URL: optionalEnv("RECOVER_SERVICE_URL"),
};
