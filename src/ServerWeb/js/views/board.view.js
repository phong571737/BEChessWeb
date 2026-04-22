export const BoardView = {
    render(gameID, fen) {
        const board = document.querySelector(`#view-game-${gameID}`);
        if (!board || typeof fen !== "string") return;

        // update board position
        if (typeof board.setPosition === "function") {
            board.setPosition(fen);
        }
        else if (board.dataset?.fen !== undefined) {
            board.dataset.fen = fen;
        }
    }
}