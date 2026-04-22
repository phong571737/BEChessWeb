import { eventBus } from "./eventbus.instance.js";

export const GameStore = {
    state: {},

    set(gameID, patch) {
        this.state[gameID] = {
            ...this.state[gameID],
            ...patch,
        };
        eventBus.emit("game:update", gameID);
    },

    get(gameID) {
        return this.state[gameID];
    }
}