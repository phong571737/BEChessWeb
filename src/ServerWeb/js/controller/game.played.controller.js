/**This file is used to control 
 * add item when a game end */

import { GamePlayedView } from "/ServerWeb/js/views/game.played.view.js";

export const GamePlayedController = {
    init(view){
        this._loadGame(view);

        // Listening the event when the game ended
        document.addEventListener("game:ended", (e) =>{
            this._addItem(view, e.detail);
        })
    },

    _addItem(view, game){
        const list = view.querySelector(".game-list");
        if (!list) return;

        // set data to view
        const item = GamePlayedView.ItemGame(game);
        list.prepend(item);

        // update total games
        const total = list.querySelectorAll(".pgn-item").length;
        this._updateTotalGame(view, total);
        this._reIndexlist(list);
    },

    // This function is used to load game from database
    async _loadGame(view){
        try {
            const res = await fetch("/games/history");
            if(!res.ok) return;

            const games = await res.json();

            const list = view.querySelector(".game-list");
            if (!list) return;

            list.innerHTML = "";
            if (!games.length) return;

            games.forEach((game, index) => {
                list.appendChild(GamePlayedView.ItemGame(game, index + 1));
            });

            // Update a number of games
            this._updateTotalGame(view, games.length);
        } catch(e){
            console.log("Fail to load games: ", e);
        }
    },

    _updateTotalGame(view, total){
        const header = view.querySelector(".played-number");
        const el = view.querySelector("#total-games");
        if (el) el.textContent = `${total} game${total !== 1 ? "s": ""}`;
        if (header) header.textContent = `${total} game${total !== 1 ? "s": ""} played`;
    },

    // This function is used to re index when a game is added
    _reIndexlist(list){
        list.querySelectorAll(".pgn-item").forEach((item, index) =>{
            const item_number = item.querySelector(".item-number");
            if(item_number) item_number.textContent(`#${index + 1}`);
        })
    }
}