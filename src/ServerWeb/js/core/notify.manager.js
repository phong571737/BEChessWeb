import { GameView } from "../views/game.view.js";
import { GameState } from "./game.state.js";

export function updateNotify(gameID) {
    const state = GameState.get(gameID);
    if (!state) return;

    const {boardStatus, gameStatus} = state;

    if (boardStatus === "offline") {
        GameView.setNotify("Board disconnected", "disconnect", gameID);
        return;
    }

    switch(gameStatus) {
        case "checkinit":
             GameView.setNotify("Board incorrect - please fix pieces", "checkinit", gameID);
            break;
        case "ready":
            GameView.setNotify("Ready - you can move", "ready", gameID);
            break;
        case "waiting":
            GameView.setNotify("Board connected", "waiting", gameID);
            break;
        default: 
            break;
    }
}