/**Handles loading game data by gameID 
 * creating a game controller 
 * and registering it in GameSynManager
*/
import { GameSyncManager } from "/app/src/ServerWeb/js/core/game.syncmanager.js";
import { GameModel } from "/app/src/ServerWeb/js/model/game.model.js";

export const GameLoader = {
    // Reload game state
    async load(gameID) {
        if (GameSyncManager.getController(gameID)) return;
        const localCache = localStorage.getItem(`game_state_${gameID}`); // get data from localStorage
         
        if (localCache) {
            try {
                const gameData = JSON.parse(localCache);
                if (gameData.gameID && (gameData.pgn || gameData.fen)) {
                    GameSyncManager.setController(gameID, new GameModel(gameData));
                    console.log("Loaded from localStorage:", gameID);
                    return;
                }
            } catch (e) {
                console.error("Failed to parse local game state", e);
            }
        }

        // if the game is not in local storage, get the game state from server
        await this.fetchfromServer(gameID);
    },

    // Fetch current game from server
    async fetchfromServer(gameID) {
        try {
            const game = await fetch(`/games/${gameID}`).then(r => r.json())
            GameSyncManager.setController(gameID, new GameModel(game));

            this.savetoLocal(gameID, game);
        } catch (e) {
            console.error("Failed to restore game ", e);
        }
    },

    // This function is used to save the state of game
    savetoLocal(gameID, gameState) {
        localStorage.setItem(`game_state_${gameID}`, JSON.stringify(gameState));
    },
}