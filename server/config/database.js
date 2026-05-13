import { MongoClient, ServerApiVersion } from "mongodb";
import { setServers as setDnsServers } from "node:dns";
import { AppError } from "../errors/index.js";
import { env } from "./environment.js";

function createClient() {
  return new MongoClient(env.MONGO_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
}

let client = createClient();

let database;

export async function connectDB() {
  if (database) return database;
  try {
    await withTimeout(client.connect(), 10_000);
  } catch (err) {
    const msg = String(err?.message || "");
    if (msg.includes("timed out")) {
      console.warn("MongoDB connection timed out — running without database (in-memory only)");
      database = null;
      return null;
    }
    const shouldRetryDns = msg.includes("No addresses found at host") || msg.includes("querySrv");
    if (!shouldRetryDns) throw err;

    // Fallback for unstable local DNS resolver when using mongodb+srv.
    setDnsServers(["1.1.1.1", "8.8.8.8"]);
    client = createClient();
    await withTimeout(client.connect(), 10_000);
  }

  // Skip ping if connection failed
  if (!client || !client.topology?.isConnected()) {
    console.warn("MongoDB not available — running without database (in-memory only)");
    database = null;
    return null;
  }

  try {
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB!");
    database = client.db("chess");
  } catch {
    console.warn("MongoDB ping failed — running without database (in-memory only)");
    database = null;
  }
  return database;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timed out")), ms))
  ]);
}

export function getDB() {
  if (!database) throw new AppError("Database not connected", 500, "DB_NOT_READY");
  return database;
}
