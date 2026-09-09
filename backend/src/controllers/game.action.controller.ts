import { Request, Response } from "express";
import { GameActionService } from "../services/game.action.service.js";
import { GameResignService } from "../services/game.resign.service.js";
import { BulkGameSetupBody, GameIdParams, RenameBody, ResignBody } from "../types/game.types.js";
import { ERROR_STATUS } from "../constant.js";
import { publishBoardCommand } from "../services/mqtt.service.js";
import { emitGameState } from "../game/game.state.js";
import { getGame } from "../models/game.model.js";
import { emitWithSpectatorDelay } from "../services/spectator-delay.service.js";

export const GameActionController = {
    async bulkSetup(
        req: Request<Record<string, never>, unknown, BulkGameSetupBody>,
        res: Response,
    ): Promise<void> {
        try {
            const { games, applyClock = false, initialTimeMs, incrementMs } = req.body ?? {};
            const maxInitialTimeMs = 24 * 60 * 60 * 1_000;
            const maxIncrementMs = 60 * 60 * 1_000;

            if (!Array.isArray(games) || games.length === 0 || games.length > 50) {
                res.status(400).json({ error: "games must contain between 1 and 50 items" });
                return;
            }
            if (applyClock && (!Number.isFinite(initialTimeMs) || initialTimeMs! <= 0 || initialTimeMs! > maxInitialTimeMs)) {
                res.status(400).json({ error: "initialTimeMs must be a positive number no greater than 24 hours" });
                return;
            }
            if (applyClock && (!Number.isFinite(incrementMs) || incrementMs! < 0 || incrementMs! > maxIncrementMs)) {
                res.status(400).json({ error: "incrementMs must be a number between 0 and 1 hour" });
                return;
            }

            for (const game of games) {
                if (!game || typeof game.gameID !== "string" || game.gameID.length === 0 || game.gameID.length > 160
                    || typeof game.whiteName !== "string" || game.whiteName.trim().length === 0 || game.whiteName.trim().length > 160
                    || typeof game.blackName !== "string" || game.blackName.trim().length === 0 || game.blackName.trim().length > 160
                    || (game.boardNumber !== undefined && (typeof game.boardNumber !== "string" || game.boardNumber.trim().length > 40))
                    || (game.location !== undefined && (typeof game.location !== "string" || game.location.trim().length > 160))
                    || (game.tournament !== undefined && (typeof game.tournament !== "string" || game.tournament.trim().length > 200))
                    || (game.round !== undefined && (!Number.isInteger(game.round) || game.round < 1 || game.round > 99))) {
                    res.status(400).json({ error: "One or more bulk setup records are invalid" });
                    return;
                }
            }

            const result = await GameActionService.bulkSetup(
                games.map((game) => ({
                    ...game,
                    gameID: game.gameID.trim(),
                    whiteName: game.whiteName.trim(),
                    blackName: game.blackName.trim(),
                    boardNumber: game.boardNumber?.trim(),
                    location: game.location?.trim(),
                    tournament: game.tournament?.trim(),
                })),
                { applyClock, initialTimeMs, incrementMs },
            );
            res.json({ ok: result.failed.length === 0, ...result });
        } catch (e) {
            console.error("Bulk setup failed:", e);
            res.status(500).json({ error: "BULK_SETUP_FAILED" });
        }
    },

    // resign action
    async resign(
        req: Request<GameIdParams, unknown, ResignBody>,
        res: Response
    ): Promise<void> {
        try {
            const gameID = req.params.id;
            const { resignSide, boardType, branchId } = req.body;
            const result = await GameResignService.handle(gameID, resignSide, boardType, branchId);
            // The game has been archived and its successor now exists. Only at
            // this point may the physical board reset and start initcheck.
            const boardResetPublished = await publishBoardCommand(result.boardID, "restart_game");
            const resultTag = resignSide === "draw" ? "1/2-1/2" : resignSide === "white" ? "0-1" : "1-0";
            // Keep every viewer in the room synchronized with the server-side
            // terminal transition, including HTTP resignations.
            await emitWithSpectatorDelay("update_all_game", {
                gameID,
                result: resultTag,
                resignSide,
            }, { scope: "game", gameID, removePublicGameID: gameID });
            await emitWithSpectatorDelay("game_status_update", { boardID: result.boardID, gameID, status: "finished", result: resultTag });
            emitGameState(result.boardID);
            const nextGame = await getGame(result.newGameID);
            await emitWithSpectatorDelay("game_status_update", { boardID: result.boardID, gameID: result.newGameID, status: "waiting" }, { publicGame: nextGame ?? undefined });
            await emitWithSpectatorDelay("board_scan_ok", { boardID: result.boardID, gameID: result.newGameID, status: "waiting" });
            res.json({ ...result, boardResetPublished });
        } catch (e) {
            console.error("RESIGN ERROR:", e);
            const message = e instanceof Error ? e.message : String(e);
            const status = message === ERROR_STATUS.NOTFOUND || message === "Game not found" ? 404
                : message === ERROR_STATUS.RESIGN_ERROR || message === "resignSide error" ? 400
                    : message === "RESIGN_IN_PROGRESS" || message === "RESIGN_ALREADY_PROCESSED" || message === "GAME_STATE_CONFLICT" ? 409
                    : 500;
            res.status(status).json({ error: message });
        }
    },

    // restart action
    async restart(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            const gameID = req.params.id;
            const result = await GameActionService.restart(gameID);
            // Keep the physical board in sync with the web reset. The game
            // reset is already committed; MQTT availability is reported to
            // the client without turning a successful reset into a 500.
            const boardResetPublished = await publishBoardCommand(result.boardID, "restart_game");
            res.json({ ok: true, boardResetPublished, ...result });
        } catch (e) {
            console.error("Restart error:", e);
            const message = e instanceof Error ? e.message : String(e);
            if (message === ERROR_STATUS.NOTFOUND) {
                res.status(404).json({ error: true, message: "Game not found" });
                return;
            }
            if (message.includes("missing boardID")) {
                res.status(409).json({
                    error: true,
                    message: "Game data is corrupted (missing boardID), cannot restart. Please contact admin.",
                });
                return;
            }
            if (message === "GAME_STATE_CONFLICT") {
                res.status(409).json({ error: true, message: "Game state changed. Reload and try again." });
                return;
            }
            res.status(500).json({ error: message });
        }
    },

    // destroy action
    async destroy(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            const gameID = req.params.id;
            const result = await GameActionService.destroy(gameID);
            await emitWithSpectatorDelay("game:destroyed", { gameID }, { removePublicGameID: gameID });
            res.json({
                result
            });
        } catch (e) {
            console.error("Destroy game error:", e);
            const message = e instanceof Error ? e.message : String(e);
            res.status(500).json({ error: message });
        }
    },

    async rename(
        req: Request<GameIdParams, unknown, RenameBody>,
        res: Response
    ): Promise<void> {
        try {
            const gameID = req.params.id;
            const { color, name, initialTimeMs, incrementMs, round, boardNumber, location, tournament } = req.body;

            const maxInitialTimeMs = 24 * 60 * 60 * 1_000;
            const maxIncrementMs = 60 * 60 * 1_000;
            // Check input validation for optional fields
            if (boardNumber !== undefined && (typeof boardNumber !== "string" || boardNumber.trim().length > 40)) {
                res.status(400).json({ error: "boardNumber must be a string no longer than 40 characters" });
                return;
            }
            if (initialTimeMs !== undefined && (!Number.isFinite(initialTimeMs) || initialTimeMs <= 0 || initialTimeMs > maxInitialTimeMs)) {
                res.status(400).json({ error: "initialTimeMs must be a positive number no greater than 24 hours" });
                return;
            }
            if (incrementMs !== undefined && (!Number.isFinite(incrementMs) || incrementMs < 0 || incrementMs > maxIncrementMs)) {
                res.status(400).json({ error: "incrementMs must be a number between 0 and 1 hour" });
                return;
            }
            if (round !== undefined && (!Number.isInteger(round) || round < 1 || round > 99)) {
                res.status(400).json({ error: "round must be an integer between 1 and 99" });
                return;
            }
            if (location !== undefined && (typeof location !== "string" || location.trim().length > 160)) {
                res.status(400).json({ error: "location must be a string no longer than 160 characters" });
                return;
            }
            if (tournament !== undefined && (typeof tournament !== "string" || tournament.trim().length > 200)) {
                res.status(400).json({ error: "tournament must be a string no longer than 200 characters" });
                return;
            }

            const clockState = await GameActionService.rename(gameID, color, name, initialTimeMs, incrementMs, round, location?.trim(), boardNumber?.trim(), tournament?.trim());

            res.json({
                ok: true,
                ...(clockState ?? {}),
            });
        } catch (e) {
            console.error("Rename failed:", e);
            const message = e instanceof Error ? e.message : String(e);
            res.status(message === "GAME_STATE_CONFLICT" ? 409 : 500).json({ error: message });
        }
    },

    // reset action
    async reset(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            const gameID = req.params.id;

            await GameActionService.reset(gameID);
            res.json({ success: true });
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            res.status(500).json({ error: message });
        }
    }
}
