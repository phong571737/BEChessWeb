import { eventBus } from "./eventbus.instance.js";

export const GameStore = {
    state: {},

    set(gameID, patch) {
        this.state[gameID] = {
            ...this.state[gameID],
            ...patch,
        };
        if (patch.cp !== undefined) {
            eventBus.emit("eval:update", gameID);
        }

        if (patch.fen) {
            eventBus.emit("game:update", gameID);
        }
    },

    get(gameID) {
        return this.state[gameID];
    }
}