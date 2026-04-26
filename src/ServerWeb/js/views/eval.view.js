export const EvalView = {
    render(gameID, cp) {
        const board = document.querySelector(`#view-game-${gameID}`);
        if (!board) return;

        if(typeof cp != "number" || isNaN(cp)) return;
        cp = Math.max(-300, Math.min(300, cp));
        const win_rate = 1 / (1 + Math.exp(-cp / 400));

        const black = board.querySelector(".eval-black");
        const white = board.querySelector(".eval-white");

        const textblack = board.querySelector(".number-black-eval");
        const textwhite = board.querySelector(".number-white-eval");

        // update height
        white.style.height = (win_rate * 100) + "%";
        black.style.height = ((1 - win_rate) * 100) + "%";

        // update number 
        textblack.textContent = cp < 0 ? `${(Math.abs(cp) / 100).toFixed(1)}` : `0.0`;
        textwhite.textContent = cp > 0 ? `+${(cp / 100).toFixed(1)}` : `${(cp / 100).toFixed(1)}`;
    }
}