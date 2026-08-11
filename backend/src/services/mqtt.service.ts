import mqtt, { MqttClient } from "mqtt";
import { env } from "../config/environment.js";
import { getIO } from "../sockets/index.js";
import { emitGameState, gameState } from "../game/game.state.js";
import { removeGameByBoardID } from "../models/game.model.js";
import { games, gameSeq, activeBranches, rawFenHistory, rawMoveHistory, pgnBaseFen } from "../game/game.repository.js";
import { getOrRestoreCurrentGame, removeCurrenGame } from "../game/game.manager.js";
import { GameActionService } from "./game.action.service.js";
import { GameResignService } from "./game.resign.service.js";
import { evaluatePosition } from "./stockfish.service.js";
import { BOARD_TYPE } from "../constant.js";
import type { ResignSide } from "../types/game.types.js";

let mqttClient: MqttClient | null = null;

interface StatusPayload {
    status: "online" | "offline" | string;
}

const OFFLINE_CLEANUP_DELAY_MS = 5 * 60 * 1000;  // 2 minutes
const pendingCleanupTimers = new Map<string, NodeJS.Timeout>();

interface RemoveGameByBoardResult {
    gameIDs?: string[];
}

interface CommandPayload {
    command?: string;
    origin?: string;
    side?: string;
    resignSide?: string;
    boardType?: string;
    branchId?: string;
    requestId?: string;
}

const COMMAND_DEDUPE_WINDOW_MS = 15_000;
const AUTO_RESULT_THRESHOLD_CP = 150;
const recentCommandKeys = new Map<string, number>();

function claimCommand(boardID: string, payload: CommandPayload, command: string, side?: string) {
    const requestKey = typeof payload.requestId === "string" && payload.requestId.trim()
        ? payload.requestId.trim()
        : `${command}:${side ?? ""}`;
    const key = `${boardID}:${requestKey}`;
    const now = Date.now();
    const previous = recentCommandKeys.get(key);
    if (previous && now - previous < COMMAND_DEDUPE_WINDOW_MS) return false;
    recentCommandKeys.set(key, now);
    setTimeout(() => {
        if (recentCommandKeys.get(key) === now) recentCommandKeys.delete(key);
    }, COMMAND_DEDUPE_WINDOW_MS);
    return true;
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
                rawFenHistory.delete(gameID);
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
            const payload = JSON.parse(message.toString()) as CommandPayload;
            // The backend subscribes to the same command topic it publishes
            // to. Do not execute our own outbound command a second time.
            if (payload.origin === "backend") return;
            const command = typeof payload.command === "string" ? payload.command.trim().toLowerCase() : "";
            if (!["restart_game_esp", "restart_game", "resign", "draw"].includes(command)) return;
            const rawSide = payload.side ?? payload.resignSide;
            const normalizedSide = typeof rawSide === "string" && ["white", "black"].includes(rawSide.trim().toLowerCase())
                ? rawSide.trim().toLowerCase() as "white" | "black"
                : undefined;
            if (command === "resign" && !normalizedSide) {
                console.warn(`[MQTT] Ignoring resign: payload must include side white or black for board ${boardID}`);
                return;
            }
            if (!claimCommand(boardID, payload, command, normalizedSide)) {
                console.warn(`[MQTT] Ignoring duplicate ${command} command for board ${boardID}`);
                return;
            }

            const gameID = await getOrRestoreCurrentGame(boardID);
            if (!gameID) {
                console.warn(`[MQTT] Ignoring ${command}: no active game for board ${boardID}`);
                return;
            }
            console.log(`[MQTT] ${command} received for board ${boardID}, game ${gameID}`);
            if (command === "restart_game_esp") {
                const boardType = typeof payload.boardType === "string" && payload.boardType.toUpperCase() === BOARD_TYPE.HALL
                    ? BOARD_TYPE.HALL
                    : BOARD_TYPE.NFC;
                const result = await finishEspRestartByEvaluation(gameID, boardID, boardType)
                    ?? await GameResignService.handleUnconfirmed(gameID, boardType);
                if (result) {
                    const resultTag = "unconfirmed" in result && result.unconfirmed
                        ? "*"
                        : result.loser === "white" ? "0-1" : "1-0";
                    getIO().to(gameID).emit("update_all_game", { gameID, result: resultTag, resignSide: result.loser });
                    getIO().emit("game_status_update", { boardID, gameID, status: "finished", result: resultTag });
                    emitGameState(boardID);
                    getIO().emit("game_status_update", { boardID, gameID: result.newGameID, status: "waiting" });
                    getIO().emit("board_scan_ok", { boardID, gameID: result.newGameID, status: "waiting" });
                }
            } else if (command === "restart_game") {
                await GameActionService.restart(gameID);
            } else {
                const resignSide: ResignSide = command === "draw" ? "draw" : normalizedSide!;
                const boardType = typeof payload.boardType === "string" && payload.boardType.toUpperCase() === BOARD_TYPE.HALL
                    ? BOARD_TYPE.HALL
                    : BOARD_TYPE.NFC;
                const branchId = typeof payload.branchId === "string" && payload.branchId.trim()
                    ? payload.branchId.trim()
                    : null;
                const result = await GameResignService.handle(gameID, resignSide, boardType, branchId);
                const resultTag = resignSide === "draw" ? "1/2-1/2" : resignSide === "white" ? "0-1" : "1-0";
                // Match the web resignation flow: update the old game room, then
                // attach the board to the newly created waiting game.
                getIO().to(gameID).emit("update_all_game", { gameID, result: resultTag, resignSide });
                getIO().emit("game_status_update", { boardID, gameID, status: "finished", result: resultTag });
                emitGameState(boardID);
                getIO().emit("game_status_update", { boardID, gameID: result.newGameID, status: "waiting" });
                getIO().emit("board_scan_ok", { boardID, gameID: result.newGameID, status: "waiting" });
            }
        } catch (e) {
            console.log("[MQTT] Command parse or lifecycle error: ", e);
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

/**
 * Evaluate the final physical-board position before creating the next game.
 * A missing or inconclusive score deliberately returns null so the caller can
 * persist a finished session with an unconfirmed outcome instead of guessing.
 */
async function finishEspRestartByEvaluation(gameID: string, boardID: string, boardType: string) {
    const { getGame } = await import("../models/game.model.js");
    const game = await getGame(gameID);
    const fen = game?.fenHistory?.at(-1) ?? game?.fen;
    const plyCount = Math.max(
      game?.fenHistory?.length ?? 0,
      game?.uciHistory?.length ?? 0,
      game?.lastSeq ?? 0,
    );
    if (!fen || plyCount < 2) return null;

    try {
        const evaluation = await evaluatePosition(fen);
        if (!evaluation) return null;
        const loser = evaluation.mate !== null
            ? evaluation.mate > 0 ? "black" : "white"
            : evaluation.cp !== null && evaluation.cp >= AUTO_RESULT_THRESHOLD_CP ? "black"
                : evaluation.cp !== null && evaluation.cp <= -AUTO_RESULT_THRESHOLD_CP ? "white"
                    : null;
        if (!loser) return null;
        return await GameResignService.handle(gameID, loser, boardType, null);
    } catch (error) {
        console.error(`[MQTT] Stockfish restart evaluation failed for ${boardID}:`, error);
        return null;
    }
}

/** Publish a non-retained command to a physical board. */
export function publishBoardCommand(
    boardID: string,
    command: string,
): Promise<boolean> {
    const client = mqttClient;
    if (!client || !client.connected || !boardID.trim()) return Promise.resolve(false);

    const topic = `chess/${boardID}/command`;
    const payload = JSON.stringify({ command, origin: "backend" });
    return new Promise((resolve) => {
        client.publish(topic, payload, { qos: 1, retain: false }, (error) => {
            if (error) {
                console.error(`[MQTT] Failed to publish ${command} for board ${boardID}:`, error);
                resolve(false);
                return;
            }
            console.log(`[MQTT] Published ${command} for board ${boardID}`);
            resolve(true);
        });
    });
}
