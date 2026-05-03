/**Handles loading game data by gameID 
 * creating a game controller 
 * and registering it in GameSynManager
*/
import { SocketController } from "../socket/socket.controller.js";
import { ViewManager } from "./view.manager.js";
import { GameSyncManager } from "../core/game.syncmanager.js";
import { GameModel } from "/ServerWeb/js/model/game.model.js";
import { GameStore } from "../utils/game.store.js";

export const GameLoader = {
    // Reload game state
    async load(gameID) {
        // if (GameSyncManager.getController(gameID)) {
        //     return;
        // }
        const localCache = localStorage.getItem(`game_state_${gameID}`); // get data from localStorage

        if (localCache) {
            try {
                const gameData = JSON.parse(localCache);

                if (gameData.gameID && (gameData.pgn || gameData.fen)) {
                    const model = new GameModel(gameData);
                    GameSyncManager.setController(gameID, model);

                    GameStore.set(gameID, {
                        fen: model.fen(),
                        pgn: model.pgn(),
                        WhiteName: model.WhiteName,
                        BlackName: model.BlackName,
                    });

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
            const model = new GameModel(game);
            GameSyncManager.setController(gameID, model);

            GameStore.set(gameID, {
                fen: model.fen(),
                pgn: model.pgn(),
                WhiteName: model.WhiteName,
                BlackName: model.BlackName,
            });

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