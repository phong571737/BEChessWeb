import { UI } from "/ServerWeb/js/UI/ui.controller.js";
import { GameController } from "/ServerWeb/js/Game/game.controller.js";

//the list of boards is displayed
const activeboards = [];

export const GameSyncManager = {
    addBoard(boardInstance) {
        activeboards.push(boardInstance);
        boardInstance.update();

        if(GameController.lastMove){
            boardInstance.HighlightMove(
                GameController.lastMove.from, 
                GameController.lastMove.to
            );
        }

        UI.update(); //update pgn table
    },

    removeBoard(gameID){
        const index = activeboards.findIndex(b => b.gameID === gameID);
        if(index > - 1){
            activeboards[index].destroyBoard();
            activeboards.splice(index, 1); // remove 1 element
        }
    },

    init() {
        /**Listen the move event */
        document.addEventListener("socket:move", (e) => {
            const data = e.detail;

            console.log("Receive data from server: ", data);
            const from = data.lastMove.from;
            const to = data.lastMove.to;

            const move = GameController.move(from, to);
            GameController.lastMove = data.lastMove;
            UI.update();
            if (move) {
                activeboards.forEach(board =>{
                    if(board.gameID === data.gameID){
                        board.renderUpdate(from, to);
                    }
                });
            }
        })
    },

    getBoard(gameID){
        return activeboards.find(b => b.gameID === gameID);
    },

    getAllBoards(){
        console.log("Current activeboards array:", activeboards);
        const boards = activeboards.filter(board => board !== undefined && board !== null);
        console.log("Get all boards:", boards);
        return boards;
    },
}