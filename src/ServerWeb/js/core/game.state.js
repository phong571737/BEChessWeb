const STORAGE_KEY = "chess_state"

function loadState() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
        return {};
    }
}

// This function is used to save the state of game
function saveState(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// This function is used to set state of game
export const GameState = {
    set(gameID, patch) {
        const state = loadState();
        if (!state.games) state.games = {};

        state.games[gameID] = {
            ...state.games[gameID],
            ...patch,
            timestamp: Date.now(),
        };

        saveState(state);
    },

    get(gameID) {
        const state = loadState();
        return state.games?.[gameID] || null;
    }
}