/**Handles loading game data by gameID 
 * creating a game controller 
 * and registering it in GameSynManager
*/
import { GameSyncManager } from "/ServerWeb/js/core/game.syncmanager.js";
import { GameController } from "/ServerWeb/js/controller/game.controller.js"

export const GameLoader = {
    // Reload game state
    async load(gameID) {
        if (GameSyncManager.getController(gameID)) return;
        try {
            const game = await fetch(`/games/${gameID}`).then(r => r.json())
            console.log("Game from server: ", game);
            GameSyncManager.setController(gameID, new GameController(game));
        } catch (e) {
            console.error("Failed to restore game ", e);
        }
    },
}