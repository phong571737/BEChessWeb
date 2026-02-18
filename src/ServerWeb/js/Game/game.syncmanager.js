import { UI } from "/ServerWeb/js/UI/ui.controller.js";
import { GameController } from "/ServerWeb/js/game/game.controller.js";

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

        boardInstance.HighlightKing();

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

            const serverGameID = data.gameID.replace(/^Board_/i, "");

            const move = GameController.move(from, to);
            GameController.lastMove = data.lastMove;
            UI.update();
            if (move) {
                activeboards.forEach(board =>{
                    const boardGameID = board.gameID.replace(/^Board_/i, "");
                    if(boardGameID === serverGameID){
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
        const boards = activeboards.filter(board => board !== undefined && board !== null);
        return boards;
    },
}