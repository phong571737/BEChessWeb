import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { getCurrentState } from "../game/game.manager.js";
import { GameIDPayload, ResignPayload } from "../types/game.types.js";
import { env } from "../config/environment.js";
import { getGame } from "../models/game.model.js";
import { GameActionService } from "../services/game.action.service.js";
import { GameResignService } from "../services/game.resign.service.js";
import { getCurrentClock } from "../services/clock.service.js";
import { emitGameState } from "../game/game.state.js";
import { emitWithSpectatorDelay, getPublicGameSnapshot } from "../services/spectator-delay.service.js";

type RequestCurrentGamePayload = Partial<GameIDPayload>;
interface MatchStatus {
    status: "ongoing" | "ended";
    winner: Exclude<ResignPayload["resignSide"], "draw"> | null;
}

const gameStatus = new Map<string, MatchStatus>();

interface SocketAuthPayload extends jwt.JwtPayload {
    role?: string;
}

function requireAuthenticatedSocket(socket: Socket): boolean {
    const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : null;
    if (!token) {
        socket.emit("action_error", { error: "Authentication required" });
        return false;
    }

    try {
        const payload = jwt.verify(token, env.JWT_SECRET) as SocketAuthPayload;
        if (typeof payload.role === "string" && payload.role.length > 0) return true;
    } catch {
        // Treat malformed and expired tokens identically.
    }

    socket.emit("action_error", { error: "Invalid or expired authentication token" });
    return false;
}

function socketAudience(socket: Socket): "admin" | "public" {
    const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : null;
    if (!token) return "public";
    try {
        const payload = jwt.verify(token, env.JWT_SECRET) as SocketAuthPayload;
        return payload.role === "admin" ? "admin" : "public";
    } catch {
        return "public";
    }
}

export function initGameSocket(io: Server): void {
    io.on("connection", (socket) =>{
        const joinedGames = new Set<string>();
        const audience = socketAudience(socket);
        socket.data.audience = audience;
        void socket.join(`audience:${audience}`);

        // Join only existing game rooms.  The membership is also checked for
        // mutating events so a client cannot publish actions to an arbitrary
        // game ID just by guessing it.
        socket.on("join", async (payload: Partial<GameIDPayload> = {}) =>{
            const gameID = typeof payload.gameID === "string" ? payload.gameID.trim() : "";
            const availableGame = gameID
                ? audience === "admin" ? await getGame(gameID) : await getPublicGameSnapshot(gameID)
                : null;
            if (!gameID || !availableGame) {
                socket.emit("action_error", { error: "Game not found" });
                return;
            }
            joinedGames.add(gameID);
            await socket.join(`game:${gameID}:${audience}`);
            socket.emit("clock_state", { gameID, ...getCurrentClock(availableGame), fen: availableGame.fen });
        });

        socket.on("request_clock_state", async (payload: Partial<GameIDPayload> = {}) => {
            const gameID = typeof payload.gameID === "string" ? payload.gameID.trim() : "";
            if (!gameID || !joinedGames.has(gameID)) {
                socket.emit("action_error", { error: "Join the game room before requesting its clock" });
                return;
            }
            const game = audience === "admin" ? await getGame(gameID) : await getPublicGameSnapshot(gameID);
            if (game) socket.emit("clock_state", { gameID, ...getCurrentClock(game), fen: game.fen });
        });

        const canMutateGame = (gameID: unknown): gameID is string => {
            if (typeof gameID !== "string" || !gameID || !joinedGames.has(gameID)) {
                socket.emit("action_error", { error: "Join the game room before sending actions" });
                return false;
            }
            return requireAuthenticatedSocket(socket);
        };

        // Save data to currentGameState
        socket.on('request_current_game', async (data: RequestCurrentGamePayload) => {
            if(!data || !data.gameID){
                console.log("The uploaded data is missing the gameID");
                return;
            }

            const gameID = data.gameID;
            if (!joinedGames.has(gameID)) {
                socket.emit("action_error", { error: "Join the game room before requesting its state" });
                return;
            }
            const currentstate = audience === "admin"
                ? await getCurrentState(gameID)
                : await getPublicGameSnapshot(gameID);

            if(currentstate){
                socket.emit("restore_game", {
                    gameID: currentstate.gameID,
                    fen: currentstate.fen,
                    lastMove: currentstate.lastMove
                });
            }else{
                console.log("No valid games found.");
            }
        });

        socket.on("resign", async (payload: ResignPayload & { boardType?: string; branchId?: string | null }) => {
            const { gameID, resignSide, boardType = "WEB", branchId = null } = payload ?? {};
            if (!canMutateGame(gameID)) return;
            try {
                const result = await GameResignService.handle(gameID, resignSide, boardType, branchId);
                const winner: MatchStatus["winner"] = result.winner;
                const resultTag = resignSide === "draw" ? "1/2-1/2" : resignSide === "white" ? "0-1" : "1-0";
                gameStatus.set(gameID, { status: "ended", winner });
                setTimeout(() => gameStatus.delete(gameID), 60_000).unref?.();
                // Load lazily to avoid sockets/index -> game.socket ->
                // mqtt.service -> sockets/index during module initialization.
                const { publishBoardCommand } = await import("../services/mqtt.service.js");
                const boardResetPublished = await publishBoardCommand(result.boardID, "restart_game");
                if (!boardResetPublished) {
                    console.error(`[Socket] Could not request physical-board reset for ${result.boardID}`);
                }
                await emitWithSpectatorDelay("update_all_game", { gameID, result: resultTag, resignSide }, { scope: "game", gameID, removePublicGameID: gameID });
                await emitWithSpectatorDelay("game_status_update", { boardID: result.boardID, gameID, status: "finished", result: resultTag });
                emitGameState(result.boardID);
                const nextGame = await getGame(result.newGameID);
                await emitWithSpectatorDelay("game_status_update", { boardID: result.boardID, gameID: result.newGameID, status: "waiting" }, { publicGame: nextGame ?? undefined });
                await emitWithSpectatorDelay("board_scan_ok", { boardID: result.boardID, gameID: result.newGameID, status: "waiting" });
                socket.emit("resign_complete", { ...result, boardResetPublished });
            } catch (error) {
                socket.emit("action_error", { error: error instanceof Error ? error.message : "Unable to resign game" });
            }
        });

        // Restart through the same atomic service used by the HTTP endpoint;
        // emitting an event alone would leave the database and board state stale.
        socket.on("restart", async (payload: Partial<GameIDPayload> = {}) => {
            const { gameID } = payload;
            if (!canMutateGame(gameID)) return;
            try {
                await GameActionService.restart(gameID);
            } catch (error) {
                socket.emit("action_error", { error: error instanceof Error ? error.message : "Unable to restart game" });
            }
        });

        // Cleanup khi client ngắt kết nối
        socket.on("disconnect", () => {
            joinedGames.clear();
        });
    })
}
