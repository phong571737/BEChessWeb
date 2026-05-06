/**
 * This file is used to check state 
 * between physicboard and ui when init 
 * */
import { GameState } from "./game.state.js";
import { updateNotify } from "./notify.manager.js";
import { GameView } from "/ServerWeb/js/views/game.view.js";

export const InitCheck = {
    _pollingTimer: {},

    startWaitingForBoard(controller, gameID) {
        this._startPolling(controller, gameID);
    },

    _startPolling(controller, gameID) {
        // Remove old timer
        if (this._pollingTimer[gameID]) {
            clearInterval(this._pollingTimer[gameID]);
        }

        // Polling when socket miss event
        this._pollingTimer[gameID] = setInterval(async () => {
            try {
                const url = `/games/${gameID}/initcheck`;
                const res = await fetch(url);
                const data = await res.json();
                if (data.status != "waiting") {
                    this.handleResult(controller, gameID, data);
                }
            } catch (e) {
                console.error("Poll failed:", e);
            }

        }, 3000);
    },

    // highlight when init wrong
    _highlightInitErrors(boardUI, highlightwrong, highlightmissing) {
        boardUI.HighlightInitErrors(highlightwrong, highlightmissing);
    },

    handleResult(controller, gameID, data) {
        const boardUI = controller.boardUI;
        const status = data.status ?? data.result?.status;
        const wrongSquares = data.wrongSquares ?? data.result?.wrongSquares ?? [];
        const missingSquares = data.missingSquares ?? data.result?.missingSquares ?? [];

        if (!boardUI) return;

        boardUI.ClearHighlightInitErrors();

        if (status == "invalid") {
            this._highlightInitErrors(boardUI, wrongSquares, missingSquares);
            GameState.set(gameID, {gameStatus: "checkinit"});
            updateNotify(gameID);
        }

        if (status == "ok") {
            this.stopPolling(gameID);
            controller.onInitReady?.();
            GameState.set(gameID, {gameStatus: "ready"});
            updateNotify(gameID);
        }
    },

    // Stop polling
    stopPolling(gameID) {
        if (this._pollingTimer[gameID]) {
            clearInterval(this._pollingTimer[gameID]);
            delete this._pollingTimer[gameID];
        }
    },
}