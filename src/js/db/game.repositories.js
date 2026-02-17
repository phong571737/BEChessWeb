import {client} from "./index.js";

const games = () => client.db("chess").collection("games");

export async function saveGame(state) {
    return games().updateOne(
        {_id: "current_game"},
        { 
            $set:{
                ...state,
                updateAt: new Date(),
            },
            $setOnInsert: {
                createdAt: new Date(),
            }
        },
        {upsert: true}
    );
}

export async function loadGame() {
    return games().findOne({ _id: "current_game"});
}
