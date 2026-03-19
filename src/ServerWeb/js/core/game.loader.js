/**Handles loading game data by gameID 
 * creating a game controller 
 * and registering it in GameSynManager
*/
import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";
import { GameModel } from "/ServerWeb/js/model/game.model.js";

export const GameLoader = {
    // Reload game state
    async load(gameID) {
        if (GameSyncManager.getController(gameID)) return;
        try {
            const game = await fetch(`/games/${gameID}`).then(r => r.json())
            GameSyncManager.setController(gameID, new GameModel(game));
        } catch (e) {
            console.error("Failed to restore game ", e);
        }
    },
}