/**This file is used to manage PGN edit mode, validates changes,
 * updates game states, and refresh board UI
 */
import { PGNEditView } from "/app/src/ServerWeb/js/views/pgn.edit.view.js";
import { GameSyncManager } from "/app/src/ServerWeb/js/core/game.syncmanager.js";

export class PGNEditController {
    // Initialize PGN editor controller with game controller
    constructor(gameController, container) {
        this.gameController = gameController;
        this.container = container
        this._editing = false;
        this._abort = null;
    }

    // Init edit button listener
    init() {
        this.container.querySelector(".btn.edit")?.addEventListener('click', () => {
            this._toggle();
        })
    }

    _toggle() {
        this._editing ? this._exit() : this._enter();
    }

    // Exit edit mode and restore move list
    _exit() {
        this._editing = false;
        this._abort?.abort(); // clean up listeners
        this._abort = null;
        const moveList = this.container.querySelector("#move-list");
        if (moveList) this.updateMoveList();
    }

    // Enter PGN editing mode
    _enter() {
        const move_list = this.container.querySelector("#move-list");
        if (!move_list) return;

        this._editing = true;
        move_list.innerHTML = "";
        move_list.appendChild(PGNEditView.PGNView(this.gameController.pgn()));

        // Abort controller to clean up old listeners
        this._abort = new AbortController();
        const { signal } = this._abort;

        // save button 
        this.container.querySelector("#save-btn")
            ?.addEventListener("click", () => this._save(), { signal, once: true });

        // exit button
        this.container.querySelector("#cancel-btn")
        ?.addEventListener("click", () => this._exit(), { signal, once: true });
    }

    // Save game after edit pgn
    async _save() {
        const newPGN = this.container.querySelector("#pgn-editor")?.value;
        try {
            this.gameController.loadPGN(newPGN);
            this.gameController.seq = this.gameController.game.history().length;
            this.synclastMove();
            await this._postPGN();
            this._refreshBoards();
            this._exit();
        } catch {
            alert("PGN không hợp lệ");
        }
    }

    // refresh board after edit pgn
    _refreshBoards(){
        const { gameID, lastMove } = this.gameController;
        GameSyncManager.getBoards(gameID)?.forEach(b => {
            b.update();
            if (lastMove) {
                b.HighlightMove(lastMove.from, lastMove.to);
            }
            b.HighlightKing();
        });;
    }

    // This function is used to synchronous last move
    synclastMove() {
        const history = this.gameController.game.history({ verbose: true });
        const lastMove = history[history.length - 1];
        if (lastMove) {
            this.gameController.lastMove = {
                from: lastMove.from,
                to: lastMove.to
            }
        }
    }

    async _postPGN() {
        const { gameID, lastMove } = this.gameController;
        const history  = this.gameController.game.history();
        const newSeq = history.length;

        await fetch(`/games/${gameID}/pgn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pgn: this.gameController.pgn(),
                fen: this.gameController.fen(),
                lastMove,
                lastSeq: newSeq, //send new Seq to server  
            })
        });
    }

    // This function is used to update pgn for pgn table
    updateMoveList() {
        const history = this.gameController.game.history({ verbose: true });
        const movelist = this.container.querySelector("#move-list");
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
}