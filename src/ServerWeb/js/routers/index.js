import { BoardUI } from "/ServerWeb/js/Board/board.ui.js";
import { GameView } from "/ServerWeb/js/components/gameView.js";
import { GameSyncManager } from "/ServerWeb/js/Game/game.syncmanager.js";
import { GameController } from "/ServerWeb/js/Game/game.controller.js";

//cache variables 
const viewCache = {
    // dashboard: document.getElementById("dashboard-view")
};

export const RouterPath = {
    navigationTo(url) {
        history.pushState(null, null, url);
        this.RouterTo();
    },

    hideViews() {
        Object.values(viewCache).forEach(view => {
            if (view) view.style.display = "none";
        });
    },

    RouterTo() {
        const path = window.location.pathname;

        if (path === "/") {
            this.renderHome();
        }

        //navigation to board
        else if (path.startsWith("/board/")) {
            const gameID = path.split("/")[2];
            this.renderBoard(gameID);
        }
    },

    renderHome() {
        console.log("Return to home page: ", viewCache);

        this.hideViews();

        if (viewCache.dashboard) {
            viewCache.dashboard.style.display = "grid";
            
            requestAnimationFrame(()=>{
                GameSyncManager.getAllBoards().forEach(boardUI =>{
                    if(boardUI.elementID.startsWith("MiniBoard_") && boardUI.board){
                        boardUI.board.resize();
                    }
                })
            });
        }

    },

    renderBoard(gameID) {
        const main_container = document.getElementById("main-wrapper");
        const viewID = `view-game-${gameID}`
        if (!main_container) return;

        this.hideViews();

        //if exists, display
        if (viewCache[viewID]) {
            viewCache[viewID].style.display = "grid";

            const boardInstance = GameSyncManager.getBoard(gameID);
            if (boardInstance && boardInstance.board) {
                requestAnimationFrame(() => {
                    boardInstance.board.resize();
                });
            }

            return;
        }

        const game_board = GameView.MainContainer(gameID);
        game_board.id = viewID;

        main_container.appendChild(game_board);

        viewCache[viewID] = game_board;

        /**create board instance */
        const boardUI = new BoardUI(`Board_${gameID}`, gameID);
        boardUI.init();

        GameSyncManager.addBoard(boardUI);

        console.log("History after open:", GameController.game.history());
        console.log("Current viewCache:", viewCache);
    },

    init() {
        viewCache.dashboard = document.getElementById("dashboard-view");

        document.addEventListener("click", (e) => {
            const link = e.target.closest("a");
            if (link && link.href && link.origin === window.location.origin) {
                e.preventDefault(); // stop reload
                this.navigationTo(link.pathname);
            }
        });
        // this.RouterTo();

        window.addEventListener("popstate", () => {
            this.RouterTo();
        })
    },

}