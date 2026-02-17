
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

let movesCollection;
export async function connectDB() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    const db = client.db("chess");
    movesCollection = db.collection("moves");
  }catch(err){
    console.log(err);
  }
}

export async function LoadGameFromDB() {
  const game = client.db("chess").collection("games");
  const data = await game.findOne({_id: "current_game"});

  if(!data?.fen){
    game.load(data.fen);
    console.log("Game restored from DB");
  }
}

// Get data from database
export function getMoveCollections(){
  if(!movesCollection) throw new Error("Must to connect Database first!");
  return movesCollection;
}