// import { PromotionUI } from "/ServerWeb/js/views/promotion.ui.js";
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
            await boardUI.BoardMoveController.onMove(moved.from, moved.to);
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
            const lastMove = data.lastMove;
            
            const model = gamemodel.get(gameID);
            if (!model) return;

            const gameBoards = boards.get(gameID);
            if (!gameBoards) return;

            // ROLLBACK: back to right branch
            if (data.isCorrection && data.correctionPGN) {
                console.warn(`Branching deviation detection! Resynchronizing the board game: ${gameID}`);
                // overwrite history state into logic model
                if (typeof model.loadPGN === "function") {
                    model.loadPGN(data.correctionPGN);
                }

                // piece update to right position
                const correctFen = model.fen();
                for (const boardUI of gameBoards) {
                    if (typeof boardUI.update === "function") {
                        boardUI.update(correctFen);
                    }
                }
            }

            const uci = data.lastMove.uci || "";
            const move = {
                from: data.lastMove.from,
                to: data.lastMove.to,
                promotion: uci.length === 5 ? uci[4] : "q"
            };

            const moved = model.makeMove(move);
            if (!moved) return;

            for (const boardUI of gameBoards) {
                const move_Ctrl = new BoardMoveController(model, boardUI);
                await move_Ctrl.onMove(moved.from, moved.to);
            }
        });
    },

    _isPromotion(model, lastMove) {
        if (lastMove.uci && lastMove.uci.length === 5) return false;
        
        const toRank = lastMove.to[1];
        const fromRank = lastMove.from[1];

        return (fromRank === "7" && toRank === "8") ||
            (fromRank === "2" && toRank === "1");
    },

    // Get element of square that promotion
    _getSquareEl(gameID, square) {
        const gameBoards = boards.get(gameID);
        if (!gameBoards?.length) return [];

        return gameBoards
         .map(b => document.querySelector(`#${b.elementID} .square-${square}`))
         .filter(Boolean);
    }
}