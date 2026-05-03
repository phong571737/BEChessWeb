import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load .env relative to this file (server/.env), not CWD
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const requiredVars = ["MONGO_URI"];
const missing = requiredVars.filter((v) => !process.env[v]);

if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

export const env = {
  PORT:      process.env.PORT      || "8080",
  MONGO_URI: process.env.MONGO_URI,
};

export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);
