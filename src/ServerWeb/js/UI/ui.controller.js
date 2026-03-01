import { GameSyncManager } from "/ServerWeb/js/game/game.syncmanager.js";
import { PGNEdit } from "/ServerWeb/js/components/pgn.edit.js";
import { GameController } from "/ServerWeb/js/game/game.controller.js";

export class UI {
    constructor(gameController) {
        this.gameController = gameController;
        this.initEditButton();
        this.initRestartButton();
    }

    update() {
        const status = this.gameController.inCheck()
            ? 'Checkmate'
            : this.gameController.isDraw()
                ? 'Draw'
                : `${this.gameController.turn() === 'w' ? 'White' : 'Black'} to move`;

        $('#status').text(status);
        $('#fen').text(this.gameController.fen());
        $('#pgn').text(this.gameController.pgn());

        this.updateMoveList();
        this.updateMaterial();
    }

    updateMoveList() {
        const history = this.gameController.game.history({ verbose: true });
        const movelist = document.getElementById("move-list");

        if (!movelist) return;

        movelist.innerHTML = "";

        for (let i = 0; i < history.length; i += 2) {
            //move number
            const num = document.createElement("span");
            num.className = 'move-index';
            num.textContent = (i / 2) + 1;
            movelist.appendChild(num);

            // white move
            if (history[i]) {
                const w = document.createElement("span");
                w.className = 'pgn-move white-move';
                w.textContent = history[i].san;
                w.dataset.ply = i;
                movelist.appendChild(w);
            }

            //black move
            if (history[i + 1]) {
                const b = document.createElement("span");
                b.className = 'pgn-move black-move'
                b.textContent = history[i + 1].san;
                b.dataset.ply = i + 1;
                movelist.appendChild(b);
            }
        }
        movelist.scrollTop = movelist.scrollHeight;
    }

    /**This function is used to render pieces */
    renderCaptured(container, pieces, color) {
        const type = ['q', 'r', 'b', 'n', 'p'];

        type.forEach(t => {
            for (let i = 0; i < pieces[t]; i++) {
                const img = document.createElement("img");
                img.src = `/lib/chessboardjs-1.0.0/img/chesspieces/wikipedia/${color}${t}.png`;
                img.width = 30;
                container.appendChild(img);
            }
        })
    }

    updateMaterial() {
        const captured = this.gameController.getCapturedPieces();
        const diff = this.gameController.getPointPieces();
        const types = ['p', 'r', 'b', 'n', 'q'];

        const blackCaptured = document.getElementById("black-piece");
        const whiteCaptured = document.getElementById("white-piece");
        const blackdiff = document.getElementById("black-diff");
        const whitediff = document.getElementById("white-diff");

        if (!blackCaptured || !whiteCaptured) return;

        blackCaptured.innerHTML = "";
        whiteCaptured.innerHTML = "";
        if (blackdiff) blackdiff.textContent = "";
        if (whitediff) whitediff.textContent = "";

        const netW = {}, netB = {};
        types.forEach(t => {
            const d = captured.w[t] - captured.b[t];
            if (d > 0) {
                netW[t] = d;
                netB[t] = 0;
            } else if (d < 0) {
                netB[t] = -d;
                netW[t] = 0;
            } else {
                netB[t] = 0; netW[t] = 0;
            }
        });

        this.renderCaptured(blackCaptured, netW, 'w');
        this.renderCaptured(whiteCaptured, netB, 'b');

        //White
        if (diff > 0 && whitediff) {
            whitediff.textContent = `+${diff}`;
        } else if (diff < 0 && blackdiff) {
            blackdiff.textContent = `+${Math.abs(diff)}`;
        }
    }

    /**This function is used to Edit PGN */
    initEditButton() {
        const edit_btn = document.querySelector(".btn.edit");
        if (!edit_btn) return;

        edit_btn.addEventListener('click', () => {
            console.log("btn edit pressed");
            this.toggleEdit();
        })
    }

    /**This function is used to Restart Game */
    initRestartButton(){
        const restart_btn = document.querySelector(".btn.restart");
        if(!restart_btn) return;

        restart_btn.addEventListener("click", async () =>{
            if(!confirm("Bạn có chắc chắc muốn restart lại ván cờ không")) return;

            const gameID = this.gameController.gameID;
            try{
                //post restart game
                await fetch(`/games/${gameID}/restart`, {
                    method: 'POST'
                });

                //Reset board client
                this.gameController.game.reset();
                this.gameController.lastMove = null;

                const board = GameSyncManager.getBoards(gameID);
                if(board){
                    board.forEach(boardUI =>{
                        boardUI.update();
                        boardUI.RemoveHighlightKing(); // remove highlight king if you're in checkmate
                        boardUI.RemoveHighlightMove();
                    });
                }
                this.update();
            }catch(e){
                console.error("Restart error: ", e);
            }
        });
    }

    toggleEdit() {
        const move_list = document.getElementById("move-list");
        if (!move_list) return;

        const isEditting = move_list.dataset.editting === "true";
        if (!isEditting) {
            const pgn = this.gameController.pgn();
            move_list.dataset.editting = "true";
            move_list.innerHTML = "";
            move_list.appendChild(PGNEdit.PGNView(pgn));

            //Save button
            document.getElementById("save-btn").addEventListener("click", async() => {
                const newPGN = document.getElementById("pgn-editor").value;
                try {
                    this.gameController.loadPGN(newPGN);
                    move_list.dataset.editting = "false";

                    //get lastMove from history
                    const history = this.gameController.game.history({verbose: true});
                    const lastMove = history[history.length - 1];
                    if(lastMove){
                        this.gameController.lastMove = {
                            from: lastMove.from,
                            to: lastMove.to
                        }
                    }

                    //update board
                    const gameID = this.gameController.gameID;

                    //post updated data to server
                    await fetch(`/games/${gameID}/pgn`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            pgn: this.gameController.pgn(),
                            fen: this.gameController.fen(),
                            lastMove: this.gameController.lastMove
                        })
                    });

                    const boards = GameSyncManager.getBoards(gameID);
                    if (boards) {
                        boards.forEach(boardUI => {
                            boardUI.update();

                            if (this.gameController.lastMove) {
                                boardUI.HighlightMove(this.gameController.lastMove.from, this.gameController.lastMove.to);
                            }
                            boardUI.HighlightKing();
                        });
                    }

                    this.update();
                } catch (e) {
                    alert("PGN không hợp lệ");
                }
            });

            //Abort button
            document.getElementById("cancel-btn").addEventListener("click", () => {
                move_list.dataset.editting = "false";
                this.update();
            })
        } else {
            move_list.dataset.editting = "false";
            this.update();
        }
    }
};