//cache variables 
const viewCache = {};

export const ViewManager = {
    get(id) {
        return viewCache[id];
    },

    setView(id, element) {
        viewCache[id] = element;
    },

    hideAll() {
        Object.values(viewCache).forEach(view => {
            if (view) view.style.display = "none";
        });
    },

    show(id) {
        if (viewCache[id]) {
            viewCache[id].style.display = 'grid';
        }
    },

    // update eval bar 
    updateEvalBar(cp, gameID) {
        const board = document.querySelector(`#view-game-${gameID}`);
        if (!board) return;

        if(typeof cp != "number" || isNaN(cp)) return;
        cp = Math.max(-300, Math.min(300, cp));
        const win_rate = 1 / (1 + Math.exp(-cp / 300));

        const black = board?.querySelector(".eval-black");
        const white = board?.querySelector(".eval-white");
        white.style.height = (win_rate * 100) + "%";
        black.style.height = ((1 - win_rate) * 100) + "%";
    }
}