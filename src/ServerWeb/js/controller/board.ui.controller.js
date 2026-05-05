/**This file is used to  Synchronizes board UI
 * with current game state
*/

export class BoardUIController {
    constructor(gameController) {
        this.gameController = gameController;
    }

    update() {
        this._updateStatus();
        this._updateMoveList();
        this._updateMaterial();
    }

    _updateStatus() {
        const status = this.gameController.inCheck()
            ? 'Checkmate'
            : this.gameController.isDraw()
                ? 'Draw'
                : `${this.gameController.turn() === 'w' ? 'White' : 'Black'} to move`;

        $('#status').text(status);
        $('#fen').text(this.gameController.fen());
        $('#pgn').text(this.gameController.pgn());
    }

    _updateMoveList() {
        const history = this.gameController.game.history({ verbose: true });
        const movelist = document.getElementById("move-list");
        if (!movelist) return;

        // if history != dom , rebuild
        const currentPlyCount = movelist.querySelectorAll(".pgn-move").length;
        if (currentPlyCount != history.length - 1) {
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
        } else {
            const historylen = history.length - 1;
            const lastMove = history[historylen];
            if (!lastMove) return

            // white
            if (historylen % 2 === 0) {
                //move number
                const num = document.createElement("span");
                num.className = 'move-index';
                num.textContent = (historylen / 2) + 1;
                movelist.appendChild(num);

                // white move
                const w = document.createElement("span");
                w.className = 'pgn-move white-move';
                w.textContent = lastMove.san;
                w.dataset.ply = historylen;
                movelist.appendChild(w);
            }
            else { // black
                const b = document.createElement("span");
                b.className = 'pgn-move black-move'
                b.textContent = lastMove.san;
                b.dataset.ply = historylen;
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
                img.src = `/lib/chessboardjs-1.0.0/img/chesspieces/wikipedia/${color}${t.toUpperCase()}.png`;
                img.width = 30;
                container.appendChild(img);
            }
        })
    }

    _updateMaterial() {
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

        // add p-2 when has piece
        const blackContainer = document.getElementById("black-captured");
        const whiteContainer = document.getElementById("white-captured");

        const hasBlack = Object.values(netW).some(v => v > 0);
        const hasWhite = Object.values(netB).some(v => v > 0);

        if (blackContainer) blackCaptured.classList.toggle("p-2", hasBlack);
        if (whiteContainer) whiteCaptured.classList.toggle("p-2", hasWhite);

        //White
        if (diff > 0 && whitediff) {
            whitediff.textContent = `+${diff}`;
        } else if (diff < 0 && blackdiff) {
            blackdiff.textContent = `+${Math.abs(diff)}`;
        }
    }
};