
const { MongoClient, ServerApiVersion } = require('mongodb');
const {env} = require("./config/environment");
const MONGO_URI = env.MONGO_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let movesCollection;
async function connectDB() {
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

// Get data from database
function getMoveCollections(){
  if(!movesCollection) throw new Error("Must to connect Database first!");
  return movesCollection;
}

module.exports = {connectDB, getMoveCollections};
