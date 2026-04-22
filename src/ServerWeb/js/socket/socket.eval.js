import { ViewManager } from "../core/view.manager.js";
import { eventBus } from "../utils/eventbus.instance.js";

export function EvalEvent(socket) {
    socket.on("eval_bestmove", ({gameID, cp}) => {
        eventBus.emit("engine:eval", {gameID, cp});
        // ViewManager.updateEvalBar(cp, gameID);
    })

    socket.on("eval_realtime", ({gameID, cp}) => {
        ViewManager.updateEvalBar(cp, gameID);
    })

}