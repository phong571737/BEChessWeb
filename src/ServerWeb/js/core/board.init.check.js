/**
 * This file is used to check state 
 * between physicboard and ui when init 
 * */
export const InitCheck = {
    _pollingTimer: {},
    _isChecking: {},

    // highlight when init wrong
    _highlightInitErrors(boardUI, highlightwrong, highlightmissing) {
        boardUI.HighlightInitErrors(highlightwrong, highlightmissing);
    },

    startPollingInitCheck(controller, gameID) {
        // Remove old timer
        if (this._pollingTimer[gameID]) {
            clearInterval(this._pollingTimer[gameID]);
        }

        this._checkAndHighlightInit(controller, gameID);
        this._pollingTimer[gameID] = setInterval(() => {
            this._checkAndHighlightInit(controller, gameID);
        }, 1000); // after 1s call _checkAndHighlightInit function to check state init
    },

    // Stop polling
    stopPolling(gameID) {
        if (this._pollingTimer[gameID]) {
            clearInterval(this._pollingTimer[gameID]);
            delete this._pollingTimer[gameID];
        }
        delete this._isChecking[gameID];
    },

    async _checkAndHighlightInit(controller, gameID) {
        if (this._isChecking[gameID]) return;
        this._isChecking[gameID] = true;

        try {
            const boardUI = controller.boardUI;
            if (!boardUI) {
                console.warn("boardUI not ready");
                return;
            }

            console.log("Init chess");
            const res = await fetch(`/games/${gameID}/initcheck`);

            const { status, wrongSquares, missingSquares } = await res.json();

            boardUI.ClearHighlightInitErrors();

            if (status === "invalid") {
                this._highlightInitErrors(boardUI, wrongSquares, missingSquares);
            } 
            if (status === "ok") {
                boardUI.ClearHighlightInitErrors();
                this.stopPolling(gameID);
            }
        } catch (e) {
            console.error("Init check failed:", e);
        } finally {
            this._isChecking[gameID] = false;
        }
    },
}