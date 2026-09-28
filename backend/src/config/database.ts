import { Db, MongoClient, ServerApiVersion } from "mongodb";
import { env } from "./environment.js";

const MONGO_URI: string = env.MONGO_URI;
const MAX_CONNECT_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 2_000;
// const MONGO_URI: string = env.MONGO_LOCAL ?? env.MONGO_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
export const client = new MongoClient(MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  serverSelectionTimeoutMS: 10_000,
  connectTimeoutMS: 10_000,
});

let database: Db | undefined;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function initializeDatabase(db: Db): Promise<void> {
  await db.collection("game_history").createIndex(
    { deleteAfter: 1 },
    { expireAfterSeconds: 0, name: "history_trash_expiry" },
  );
  await db.collection("game_history").createIndex(
    { deletedAt: 1, createdAt: -1 },
    { name: "history_active_created_at" },
  );
  await db.collection("board_uptime").createIndex(
    { boardID: 1 },
    { unique: true, name: "board_uptime_board_id" },
  );
  await db.collection("board_uptime_sessions").createIndex(
    { boardID: 1, onlineAt: -1 },
    { name: "board_uptime_sessions_board_started" },
  );
  await db.collection("board_uptime_sessions").createIndex(
    { boardID: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: "online" }, name: "board_uptime_one_open_session" },
  );
}

export async function connectDB(): Promise<Db> {
  if (database) return database; // avoid making multiple connections

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1) {
    try {
      await client.connect();
      await client.db("admin").command({ ping: 1 });

      const connectedDatabase = client.db("chess");
      await initializeDatabase(connectedDatabase);

      database = connectedDatabase;
      console.log("[MongoDB] Connected successfully");
      return database;
    } catch (error) {
      lastError = error;
      console.error(
        `[MongoDB] Connection attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed`,
        error,
      );

      if (attempt < MAX_CONNECT_ATTEMPTS) {
        const retryDelay = Math.min(
          BASE_RETRY_DELAY_MS * 2 ** (attempt - 1),
          30_000,
        );
        console.log(`[MongoDB] Retrying in ${retryDelay}ms`);
        await wait(retryDelay);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("MongoDB connection failed");
}

export function getDB(): Db {
  if (!database) throw new Error("Database not connected!");
  return database;
}
