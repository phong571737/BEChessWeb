import { MongoClient, ServerApiVersion } from "mongodb";
import {env} from "../config/environment.js";
const MONGO_URI = env.MONGO_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
export const client = new MongoClient(MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let database;
export async function connectDB() {
  try {
    if(database) return database; // avoid making multiple connections

    await client.connect(); 
    await client.db("admin").command({ ping: 1 });

    console.log("Connected to MongoDB!");

    database = client.db("chess");
    return database;
  }catch(err){
    console.log(err);
  }
}

export function getDB(){
    if(!database) throw new Error("Database not connected!");
    return database;
}