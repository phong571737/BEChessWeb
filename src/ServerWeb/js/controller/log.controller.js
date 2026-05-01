import { LogView } from "../views/log.view.js";
import { ModalView } from "../views/modal.view.js";

export const LogController = {
    init(view) {
        this.loadLog(view);
        this.addItem(view);
        this.bind(view);
    },

    async addItem(view) {
        const list = view.querySelector(".log-list");
        if (!list) return;

        const item = LogView.ItemLog();
        list.prepend(item);

        const total = list.querySelectorAll(".log-item").length;
    },

    // load log
    async loadLog(view) {
        try {
            const res = await fetch("/games/log");
            if (!res.ok) return;

            const games = await res.json();

            const list = view.querySelector(".log-list");
            if (!list) return;

            list.innerHTML = "";
            if (!games.length) return;

            games.forEach((game, index) => {
                const item = LogView.ItemLog(index + 1);
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
            // this.updateStats(view, games);
        } catch (e) {
            console.error("Fail to fetch stats:", e);
        }
    },

    mount() {
        if (document.querySelector(".log-modal-container")) return;

        const close = () => {
            document.querySelector(".log-modal-container")?.remove();
        }
        const modal = ModalView.LogModal(close);
        // exit modal



        modal.addEventListener("click", (e) => {
            if (!e.target.closest(".modal-log-content")) close();
        });
        document.getElementById("view-game-log").appendChild(modal);
    },

    bind(view) {
        view.addEventListener("click", (e) => {
            if (e.target.closest(".log-modal-container")) return;
            
            this.mount();
        })
    }
}