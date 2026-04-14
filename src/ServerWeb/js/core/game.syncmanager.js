import { BoardMoveController } from "/ServerWeb/js/controller/board.move.controller.js";

//the list of boards is displayed
const boards = new Map(); // 1 gameid -> 1 board
const gamemodel = new Map(); //1 gameid -> 1 gamemodel

export const GameSyncManager = {
    /**Get 1 controller from 1 id */
    getController(gameID) {
        return gamemodel.get(gameID) || null;
    },

    setController(gameID, controller) {
        gamemodel.set(gameID, controller)
    },

    getBoards(gameID) {
        return boards.get(gameID);
    },

    getAllBoards() {
        return boards;
    },

    addBoard(gameID, boardUI) {
        if (!boards.has(gameID)) {
            boards.set(gameID, []);
        }

        boards.get(gameID).push(boardUI);
        boardUI.update();
    },

    /**Notify when has move */
    async notifyMove(gameID, move, sourceBoardUI = null) {
        console.log("Notifymove called: ", gameID, move);
        console.log("Board maps: ", boards);

        const controller = gamemodel.get(gameID);
        console.log("Controller found: ", controller);
        if (!controller) return;

        const moved = controller.makeMove(move);
        if (!moved) return;

        const gameBoards = boards.get(gameID);
        console.log("board for gameID: ", gameBoards);
        if (!gameBoards) return;

        for (const boardUI of gameBoards) {
            if (boardUI === sourceBoardUI) continue;
            await boardUI.moveController.onMove(moved.from, moved.to);
        }
    },

    removeBoard(gameID) {
        if (!boards.has(gameID)) return;

        boards.delete(gameID);
        gamemodel.delete(gameID);
    },

    init() {
        /**Listen the move event */
        document.addEventListener("socket:move", async (e) => {
            const data = e.detail;

            const gameID = data.gameID;
            const model = gamemodel.get(gameID);
            if (!model) return;

            const gameBoards = boards.get(gameID);
            if (!gameBoards) return;

            if (data.pgn && typeof model.loadPGN === "function") {
                model.loadPGN(data.pgn);
            }

            if (data.lastMove) {
                model.lastMove = data.lastMove;
            }

            // ROLLBACK: back to right branch
            if (data.isCorrection && data.correctionPGN) {
                model.loadPGN(data.correctionPGN);
            }

            this._saveStatetoLocal(gameID, model);

            const from = data.lastMove?.from;
            const to = data.lastMove?.to

            for (const boardUI of gameBoards) {
                if (boardUI.moveController?.onMove) {
                    await boardUI.moveController.onMove(from, to);
                } else if (typeof boardUI.update === "function") {
                    boardUI.update();
                }
            }
        });
    },

    _saveStatetoLocal(gameID, model) {
        const key = `game_state_${gameID}`;
        const oldState = JSON.parse(localStorage.getItem(key) || "{}");

        const statetoSave = {
            ...oldState, // save old data
            _gameID: gameID,
            fen: typeof model.fen === "function" ? model.fen() : model.fen,
            pgn: typeof model.pgn === "function" ? model.pgn() : model.pgn,
            lastMove: model.lastMove || null,

            WhiteName: model.WhiteName ?? oldState.WhiteName ?? "White",
            BlackName: model.BlackName ?? oldState.BlackName ?? "Black",
            timestamp: Date.now()
        }

        localStorage.setItem(key, JSON.stringify(statetoSave));
    },
}