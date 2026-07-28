import mqtt, { MqttClient } from "mqtt";
import { env } from "../config/environment.js";
import { getIO } from "../sockets/index.js";
import { emitGameState, gameState } from "../game/game.state.js";
import { getLatestGameByBoardID, removeGameByBoardID } from "../models/game.model.js";
import { games, gameSeq, activeBranches, rawMoveHistory, pgnBaseFen } from "../game/game.repository.js";
import { getCurrentGame, removeCurrenGame, setCurrentGame } from "../game/game.manager.js";
import { GameActionService } from "./game.action.service.js";

let mqttClient: MqttClient | null = null;

interface StatusPayload {
    status: "online" | "offline" | "restart" | string;
}

const OFFLINE_CLEANUP_DELAY_MS = 5 * 60 * 1000;  // 2 minutes
const pendingCleanupTimers = new Map<string, NodeJS.Timeout>();

interface RemoveGameByBoardResult {
    gameIDs?: string[];
}

function cancelPendingCleanup(boardID: string) {
    const timer = pendingCleanupTimers.get(boardID);
    if (timer) {
        clearTimeout(timer);
        pendingCleanupTimers.delete(boardID);
        console.log(`[MQTT] Cancelled pending cleanup for board ${boardID}`);
    }
}

async function cleanupBoard(boardID: string) {
    try {
        const result: RemoveGameByBoardResult = await removeGameByBoardID(boardID);
        console.log("[MQTT] Remove result:", result);
        if (result?.gameIDs?.length) {
            for (const gameID of result.gameIDs) {
                games.delete(gameID);
                gameSeq.delete(gameID);
                activeBranches.delete(gameID);
                rawMoveHistory.delete(gameID);
                pgnBaseFen.delete(gameID);
                console.log(`Cleaned game ${gameID} from RAM`);
            }
        }
        removeCurrenGame(boardID); // remove old gameID
        gameState.delete(boardID); // xóa hẳn thay vì set offline để tránh leak
        try {
            console.log(`[MQTT] Emitting game:destroyed for ${boardID}`);
            getIO().emit("game:destroyed", { boardID, gameIDs: result?.gameIDs ?? [] });
        } catch (e) {
            // socket may not be initialized; ignore
        }
        try {
            console.log(`[MQTT] Emitting board_offline for ${boardID} after cleanup`);
            getIO().emit("board_offline", { boardID });
        } catch (e) {
            // ignore
        }
    } catch (e) {
        console.error("[MQTT] Cleanup error:", e);
    } finally {
        pendingCleanupTimers.delete(boardID);
    }
}

// This function is used to handle message
async function handleMessage(topic: string, message: Buffer) {
    const parts = topic.split('/');

    if (parts.length === 3 && parts[0] === "chess" && parts[2] === "command") {
        const boardID = parts[1];
        if (!boardID) return;
        try {
            const payload = JSON.parse(message.toString()) as { command?: string };
            if (payload.command !== "restart_game_esp" && payload.command !== "restart_game") return;

            let gameID = getCurrentGame(boardID);
            if (!gameID) {
                const persistedGame = await getLatestGameByBoardID(boardID);
                if (persistedGame?.gameID) {
                    gameID = persistedGame.gameID;
                    setCurrentGame(boardID, gameID);
                    console.log(`[MQTT] Restored board ${boardID} → game ${gameID} from MongoDB for ${payload.command}`);
                }
            }
            if (!gameID) {
                console.warn(`[MQTT] Ignoring ${payload.command}: no active game for board ${boardID}`);
                return;
            }
            console.log(`[MQTT] ${payload.command} received for board ${boardID}, game ${gameID}`);
            await GameActionService.restart(gameID);
        } catch (e) {
            console.log("[MQTT] Command parse or restart error: ", e);
        }
        return;
    }

    if (parts.length === 3 && parts[0] === 'chess' && parts[2] === 'status') {
        const boardID = parts[1];
        if (!boardID) return;
        try {
            const payload = JSON.parse(message.toString());

            // if status is online(board connected)
            if (payload.status === 'online') {
                console.log(`[MQTT] Board ${boardID} online`);
                cancelPendingCleanup(boardID);
                gameState.set(boardID, { boardStatus: "online" });
            } else if (payload.status === 'offline') { // board disconnected (power outage or network hiccup)
                console.log(`[MQTT] Board ${boardID} offline signal received`);
                gameState.set(boardID, { boardStatus: "offline" });

                // Notify frontend immediately that the board is offline
                try {
                    console.log(`[MQTT] Emitting board_offline for ${boardID}`);
                    getIO().emit("board_offline", { boardID });
                } catch (e) {
                    // ignore if socket not initialized
                }

                // Hủy timer cũ nếu có
                cancelPendingCleanup(boardID);

                // Chờ 2 phút mới thực sự xóa game để phòng trường hợp rớt ping chốc lát hoặc reconnect
                const timer = setTimeout(async () => {
                    console.log(`[MQTT] Executing delayed cleanup for board ${boardID} after 2m offline`);
                    await cleanupBoard(boardID);
                }, OFFLINE_CLEANUP_DELAY_MS);

                pendingCleanupTimers.set(boardID, timer);
            } else if (payload.status === "restart") {
                console.log(`[MQTT] Board ${boardID} restart`);
                cancelPendingCleanup(boardID);
                gameState.set(boardID, { boardStatus: "online", gameStatus: "restart" });

                setTimeout(() => {
                    gameState.set(boardID, { boardStatus: "online", gameStatus: "checkinit" });
                }, 100);
            }

            emitGameState(boardID);
        } catch (e) {
            console.log("[MQTT] Parse message error: ", e);
        }
    }
}

// init mqtt
export function initMqtt() {
    // MQTT
    const MqttOptions = {
        port: env.MQTT_PORT,
        username: env.MQTT_USER,
        password: env.MQTT_PASSWORD,
    };

    const brokerURL = env.URL_HIVEMQTT;
    mqttClient = mqtt.connect(brokerURL, MqttOptions);

    mqttClient.on('connect', () => {
        console.log("Connect to broker successfully!");

        // subcribe status to broker
        mqttClient!.subscribe("chess/+/status", { qos: 1 }, (err) => {
            if (err) {
                console.error("[MQTT] Subscribe failed:", err);
            } else {
                console.log(`[MQTT] Subscribed to chess/+/status`);
            }
        });
        mqttClient!.subscribe("chess/+/command", { qos: 1 }, (err) => {
            if (err) {
                console.error("[MQTT] Command subscribe failed:", err);
            } else {
                console.log("[MQTT] Subscribed to chess/+/command");
            }
        });
    })

    mqttClient.on('message', handleMessage); // handle message on and off

    mqttClient.on('error', (err) => {
        console.error("[MQTT] error connect:", err);
    });
}

export function getMqttClient() {
    return mqttClient;
}
