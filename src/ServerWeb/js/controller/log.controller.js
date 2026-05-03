import { LogView } from "../views/log.view.js";
import { ModalView } from "../views/modal.view.js";

export const LogController = {
    init(view) {
        this.games = [];
        this.loadLog(view);
        this.bind(view);
    },

    // load log
    async loadLog(view) {
        try {
            const res = await fetch("/games/log");
            if (!res.ok) return;

            const games = await res.json();
            this.games = games;

            const list = view.querySelector(".log-list");
            if (!list) return;

            list.innerHTML = "";
            if (!games.length) return;

            games.forEach((game, index) => {
                if (!game.moves || game.moves.length === 0) return;
                const item = LogView.ItemLog(index);
                item.dataset.index = index;
                list.appendChild(item);
            });

            await this.updateLogFromServer(view);
        } catch (e) {
            console.log("Fail to load log: ", e);
        }
    },

    // Update
    async updateLogFromServer(view) {
        try {
            const res = await fetch("/games/log");
            if (!res.ok) return;

            const games = await res.json();
        } catch (e) {
            console.error("Fail to fetch stats:", e);
        }
    },

    mount(game) {
        if (document.querySelector(".log-modal-container")) return;

        const close = () => {
            document.querySelector(".log-modal-container")?.remove();
        }
        const modal = ModalView.LogModal(game, close);
        document.getElementById("view-game-log").appendChild(modal);
    },

    bind(view) {
        view.addEventListener("click", (e) => {
            const item = e.target.closest(".log-item");
            if (!item) return;

            const index = item.dataset.index;
            const game = this.games[index];

            this.mount(game);
        })
    }
}