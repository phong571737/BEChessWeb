/**This file is used to control 
 * add item when a game end */

import { GamePlayedView } from "../views/game.played.view.js";

export const GamePlayedController = {
    init(view) {
        this._loadGame(view);

        // Listening the event when the game ended
        document.addEventListener("game:ended", (e) => {
            this._addItem(view, e.detail);
        })
    },

    async _addItem(view, game) {
        const list = view.querySelector(".game-list");
        if (!list) return;

        // set data to view
        const item = GamePlayedView.ItemGame(game);
        list.prepend(item);

        this._bindRemove(view, item);

        // update total games
        const total = list.querySelectorAll(".pgn-item").length;
        this._updateTotalGame(view, total);
        this._reIndexlist(list);
        await this._updateStatsFromServer(view);
    },

    // This function is used to load game from database
    async _loadGame(view) {
        try {
            const res = await fetch("/games/history");
            if (!res.ok) return;

            const games = await res.json();

            const list = view.querySelector(".game-list");
            if (!list) return;

            list.innerHTML = "";
            if (!games.length) return;

            games.forEach((game, index) => {
                const item = GamePlayedView.ItemGame(game, index + 1);
                this._bindRemove(view, item);
                list.appendChild(item);
            });

            // Update a number of games
            this._updateTotalGame(view, games.length);
            await this._updateStatsFromServer(view);
        } catch (e) {
            console.log("Fail to load games: ", e);
        }
    },

    // Update total game played 
    _updateTotalGame(view, total) {
        const text = `${total} game${total !== 1 ? "s" : ""}`;
        const header = view.querySelector(".played-number");
        view.querySelectorAll(".total-games")
            .forEach(el => el.textContent = text);

        if (header) header.textContent = `${total} game${total !== 1 ? "s" : ""} played`;
    },

    // This function is used to reindex when a game is added
    _reIndexlist(list) {
        list.querySelectorAll(".pgn-item").forEach((item, index) => {
            const item_number = item.querySelector(".item-number");
            if (item_number) item_number.textContent = `#${index + 1}`;
        })
    },

    // Remove game played
    _bindRemove(view, item) {
        const btn = item.querySelector(".remove-pgn");
        if (!btn) return;

        btn.addEventListener("click", async (e) => {
            e.stopPropagation();

            const id = item.dataset.id;
            if (!id) return;

            const confirmed = await this._confirm();
            if (!confirmed) return;

            try {
                const res = await fetch(`/games/history/${id}`, { method: "DELETE" });
                if (!res.ok) throw new Error("Failed to delete");

                const list = view.querySelector(".game-list");
                item.remove();

                // update totat game after remove game
                const total = list.querySelectorAll(".pgn-item").length;
                this._updateTotalGame(view, total);
                this._reIndexlist(list);

                await this._updateStatsFromServer(view);
            } catch (e) {
                console.error("Failed to remove game:", e);
            }
        });
    },

    // Update
    async _updateStatsFromServer(view) {
        try {
            const res = await fetch("/games/history");
            if (!res.ok) return;

            const games = await res.json();
            this.updateStats(view, games);
        } catch (e) {
            console.error("Fail to fetch stats:", e);
        }
    },

    _confirm() {
        return new Promise((resolve) => {
            const modal = GamePlayedView.ConfirmModal();
            document.body.appendChild(modal);

            const cleanup = () => modal.remove();

            modal.querySelector("#modal-confirm").addEventListener("click", () => {
                cleanup();
                resolve(true);
            });

            modal.querySelector("#modal-cancel").addEventListener("click", () => {
                cleanup();
                resolve(false);
            });

            // click backdrop để đóng
            modal.querySelector(".absolute.inset-0").addEventListener("click", () => {
                cleanup();
                resolve(false);
            });
        });
    },

    // This function is used to update the number of game
    updateStats(view, games) {
        const white = games.filter(g => g.Result === "1-0").length;
        const black = games.filter(g => g.Result === "0-1").length;
        const draw = games.filter(g => g.Result === "1/2-1/2").length;
        const total = games.length;

        const w_num = view.querySelector("#total-white");
        const b_num = view.querySelector("#total-black");
        const d_num = view.querySelector("#total-draw");

        if (w_num) w_num.textContent = white;
        if (b_num) b_num.textContent = black;
        if (d_num) d_num.textContent = draw;

        const performance_card = view.querySelector(".performance-card");
        if (performance_card) performance_card.style.display = total === 0 ? "none" : "";

        if (total > 0) {
            const w_bar = (white / total) * 100;
            const b_bar = (black / total) * 100;
            const d_bar = (draw / total) * 100;

            const white_bar = view.querySelector(".white-win");
            const black_bar = view.querySelector(".black-win");
            const draw_bar = view.querySelector(".bar-draw");

            white_bar.style.width = `${w_bar}%`;
            draw_bar.style.width = `${d_bar}%`;
            black_bar.style.width = `${b_bar}%`;

            if (w_bar === 100) {
                white_bar.classList.add("rounded-full");
            } else {
                white_bar.classList.add("round-l-full");
            }

            if (d_bar === 100) {
                draw_bar.classList.add("rounded-full");
            }

            if (b_bar === 100) {
                black_bar.classList.add("rounded-full");
            } else {
                black_bar.classList.add("round-r-full");
            }
        }
    }
}