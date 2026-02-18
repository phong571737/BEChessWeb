import { GameController } from "/ServerWeb/js/game/game.controller.js";

export const UI = {
    update() {
        const status = GameController.inCheck()
            ? 'Checkmate'
            : GameController.isDraw()
                ? 'Draw'
                : `${GameController.turn() === 'w' ? 'White' : 'Black'} to move`;

        $('#status').text(status);
        $('#fen').text(GameController.fen());
        $('#pgn').text(GameController.pgn())

        this.updateMoveList();
    },

    updateMoveList(){
        const history = GameController.game.history({verbose: true});
        const movelist = document.getElementById("move-list");
        
        if(!movelist) return;

        movelist.innerHTML = "";

        for (let i = 0; i < history.length; i += 2) {
            //move number
            const num = document.createElement("i5z");
            num.textContent = (i / 2) + 1;
            movelist.appendChild(num);

            // white move
            if(history[i]){
                const w = document.createElement("kwdb");
                w.textContent = history[i].san;
                w.dataset.ply = i;
                movelist.appendChild(w);
            }

            if(history[i + 1]){
                const b = document.createElement("kwdb");
                b.textContent = history[i + 1].san;
                b.dataset.ply = i + 1;
                movelist.appendChild(b);
            }
        }
        movelist.scrollTop = movelist.scrollHeight;
    },
};