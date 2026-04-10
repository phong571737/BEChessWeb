import { GameEndController } from "/app/src/ServerWeb/js/controller/game.end.controller.js";

export class BoardMoveController {
    constructor(gameController, boardUI){
        this.gameController = gameController;
        this.boardUI = boardUI;
        this.gameEnd = new GameEndController(gameController);
    }

    async onMove(from, to){
        this.boardUI.update();

        this.boardUI.HighlightMove(from, to);
        this.boardUI.HighlightKing();
        this.boardUI.ui.update();

        if(this.boardUI.isPrimary){
            await this.gameEnd.handleIfGameOver(this.boardUI);
        }
    }
}