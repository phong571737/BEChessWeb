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
    await client.connect();
  } catch (err) {
    const msg = String(err?.message || "");
    const shouldRetryDns = msg.includes("No addresses found at host") || msg.includes("querySrv");
    if (!shouldRetryDns) throw err;

    // Fallback for unstable local DNS resolver when using mongodb+srv.
    setDnsServers(["1.1.1.1", "8.8.8.8"]);
    client = createClient();
    await client.connect();
  }

  await client.db("admin").command({ ping: 1 });
  console.log("Connected to MongoDB!");

  database = client.db("chess");
  return database;
}

export function getDB() {
  if (!database) throw new AppError("Database not connected", 500, "DB_NOT_READY");
  return database;
}
