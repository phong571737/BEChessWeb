import { ViewManager } from "../core/view.manager.js";
import { eventBus } from "../utils/eventbus.instance.js";
import { GameStore } from "../utils/game.store.js";

export function EvalEvent(socket) {
    socket.on("eval_bestmove", ({gameID, cp}) => {
        GameStore.set(gameID, {cp});
    })

    socket.on("eval_realtime", ({gameID, cp}) => {
        GameStore.set(gameID, {cp});
    })

}