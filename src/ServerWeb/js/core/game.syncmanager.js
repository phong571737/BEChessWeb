import { BoardMoveController } from "/ServerWeb/js/controller/board.move.controller.js";
import { GameModel } from "/ServerWeb/js/model/game.model.js";

//the list of boards is displayed
const boards = new Map(); // 1 gameid -> 1 board
const gamemodel = new Map(); //1 gameid -> 1 gamemodel

export const GameSyncManager = {
    /**Get 1 controller from 1 id */
    getController(gameID) {
        return gamemodel.get(gameID) || null;
    },

    setController(gameID, controller){
        gamemodel.set(gameID, controller)
    },

    getBoards(gameID){
        return boards.get(gameID);
    },

    getAllBoards(){
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
            if(boardUI === sourceBoardUI) continue;
            await boardUI.BoardMoveController.onMove(moved.from, moved.to);
        }
    },

    removeBoard(gameID) {
        if(!boards.has(gameID)) return;

        boards.delete(gameID);
        gamemodel.delete(gameID);
    },

    init() {
        /**Listen the move event */
        document.addEventListener("socket:move", async (e) => {
            const data = e.detail;
            const gameID = data.gameID;
            console.log("Receive data from server: ", data);

            const model = gamemodel.get(gameID);
            if (!model) return;

            const move = {
                from: data.lastMove.from,
                to: data.lastMove.to,
                promotion: 'q'
            };

            const moved = model.makeMove(move);
            if (!moved) return;

            const gameBoards = boards.get(gameID);
            if (!gameBoards) return;

            for (const boardUI of gameBoards) {
                const move_Ctrl = new BoardMoveController(model, boardUI);
                await move_Ctrl.onMove(moved.from, moved.to);
            }
        });
    },
}