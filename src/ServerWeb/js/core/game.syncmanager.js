// import { UI } from "/ServerWeb/js/UI/ui.controller.js";
import { GameController } from "/ServerWeb/js/controller/game.controller.js";

//the list of boards is displayed
const boards = new Map(); // 1 gameid -> 1 board
const gameController = new Map(); //1 gameid -> 1 gamecontroller

export const GameSyncManager = {
    /**Get 1 controller from 1 id */
    getController(gameID) {
        return gameController.get(gameID) || null;
    },

    setController(gameID, controller){
        gameController.set(gameID, controller)
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
    notifyMove(gameID, move, sourceBoardUI = null) {
        console.log("Notifymove called: ", gameID, move);
        console.log("Board maps: ", boards);

        const controller = gameController.get(gameID);
        console.log("Controller found: ", controller);
        if (!controller) return;

        const moved = controller.makeMove(move);
        if (!moved) return;

        const gameBoards = boards.get(gameID);
        console.log("board for gameID: ", gameBoards);
        if (!gameBoards) return;

        gameBoards.forEach(boardUI => {
            if(boardUI === sourceBoardUI) return;
            boardUI.renderUpdate(moved.from, moved.to);
        });
    },

    removeBoard(gameID) {
        if(!boards.has(gameID)) return;

        boards.delete(gameID);
        gameController.delete(gameID);
    },

    init() {
        /**Listen the move event */
        document.addEventListener("socket:move", (e) => {
            const data = e.detail;
            const gameID = data.gameID;
            console.log("Receive data from server: ", data);

            const controller = gameController.get(gameID);
            if (!controller) return;

            const move = {
                from: data.lastMove.from,
                to: data.lastMove.to,
                promotion: 'q'
            };

            const moved = controller.makeMove(move);
            if (!moved) return;

            const gameBoards = boards.get(gameID);
            if (!gameBoards) return;

            gameBoards.forEach(boardUI => {
                boardUI.renderUpdate(moved.from, moved.to);
            });
        })
    },
}