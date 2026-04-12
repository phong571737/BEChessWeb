const initState = new Map();

export const InitCheckService = {
    save(gameID, result) {
        initState.set(gameID, result);
    },

    get(gameID) {
        return initState.get(gameID) || null;
    },

    clear(gameID) {
        initState.delete(gameID);
    }
}