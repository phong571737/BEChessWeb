import { Db, MongoClient, ServerApiVersion } from "mongodb";
import { env } from "./environment.js";

const MONGO_URI: string = env.MONGO_URI;
// const MONGO_URI: string = env.MONGO_LOCAL ?? env.MONGO_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
export const client = new MongoClient(MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let database: Db | undefined;

export async function connectDB(): Promise<Db | undefined> {
  try {
    if (database) return database; // avoid making multiple connections

    await client.connect();
    await client.db("admin").command({ ping: 1 });

    console.log("Connected to MongoDB!");

    database = client.db("chess");
    await database.collection("game_history").createIndex(
      { deleteAfter: 1 },
      { expireAfterSeconds: 0, name: "history_trash_expiry" },
    );
    return database;
  } catch (err) {
    console.log(err);
  }
}

export function getDB(): Db {
  if (!database) throw new Error("Database not connected!");
  return database;
}
