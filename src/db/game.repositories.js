const {client} = require(".");

const games = () => client.db("chess").collection("games");

async function saveGame(state) {
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

async function loadGame() {
    return games().findOne({ _id: "current_game"});
}

module.exports = {loadGame, saveGame};