import { Request, Response } from "express";
import { appendHistoryFen, deleteHistoryFen, getPGNCollections, getAllGame, getGameCollections, moveHistoryToTrash, permanentlyDeleteAllHistoryFromTrash, permanentlyDeleteHistoryFromTrash, replaceHistoryFens as replaceHistoryFenList, restoreHistoryFromTrash, saveHistoryAnalysis, updateHistoryFen, updateHistoryTraces } from "../models/game.model.js";
import { ERROR_STATUS, GAME_STATUS } from "../constant.js";
import { gameState } from "../game/game.state.js";
import { GameIdParams } from "../types/game.types.js";
import type { Document as MongoDocument, WithId } from "mongodb";
import { getBoardIDByGame } from "../game/game.manager.js";
import { resolveTimeControlType } from "../utils/time-control.js";
import { countHistoryPlies, currentHistoryFen } from "../utils/history-metrics.js";
import { getCurrentClock } from "../services/clock.service.js";

/** Normalizes an administrator-supplied snapshot without enforcing chess legality. */
function storedFen(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const fen = value.trim();
    return fen || null;
}

function serializeHistoryRecord(record: WithId<MongoDocument>): MongoDocument & { _id: string } {
    const { totalMoves: _legacyTotalMoves, totalPlies: _legacyTotalPlies, ...storedRecord } = record;
    const whiteName = String(record.whiteName ?? record.WhiteName ?? record.White ?? "White");
    const blackName = String(record.blackName ?? record.BlackName ?? record.Black ?? "Black");
    const result = String(record.result ?? record.Result ?? "*");
    return {
        ...storedRecord,
        _id: typeof record._id === "string" ? record._id : record._id?.toString?.() ?? "",
        whiteName,
        blackName,
        WhiteName: whiteName,
        BlackName: blackName,
        result,
        Result: result,
        currentFen: currentHistoryFen(record),
        timeControlType: resolveTimeControlType(record.initialTimeMs, record.incrementMs, record.timeControlType),
    };
}

export const GameController = {
    // Get current state
    async getCurrent(req: Request, res: Response): Promise<void> {
        try {
            const game = await getAllGame();
            if (!game) {
                res.json(null);
                return;
            }
            res.json(game.map((record) => ({
                ...record,
                ...getCurrentClock(record),
                timeControlType: resolveTimeControlType(record.initialTimeMs, record.incrementMs, record.timeControlType),
            })));
        } catch (e) {
            console.log(e);
        }
    },

    // get history of game
    async getHistory(req: Request, res: Response): Promise<void> {
        try {
            const history = (await getPGNCollections()
                .find({ deletedAt: { $exists: false } })
                .sort({ createdAt: -1 }) // newest
                .toArray())
                .filter((row) => {
                    const totalPlies = countHistoryPlies(row);
                    return Number.isFinite(totalPlies) && totalPlies > 0;
                });

            // History snapshots created by older versions sometimes retained
            // only a move count. For an unfinished game the live game document
            // is still authoritative and contains its names, PGN, UCI/FEN
            // history, and current clock metadata. Enrich only incomplete
            // snapshots; finished history remains immutable.
            const activeIds = history
                .filter((row) => row.outcomeStatus !== "unconfirmed" && (row.historyStatus === "active" || !row.Result || row.Result === "*"))
                .map((row) => row.gameID)
                .filter((gameID): gameID is string => typeof gameID === "string" && gameID.length > 0);
            const liveGames = activeIds.length
                ? await getGameCollections().find({ gameID: { $in: activeIds } }).toArray()
                : [];
            const liveByGameID = new Map(liveGames.map((game) => [game.gameID, game]));
            const games = history.map((snapshot) => {
                const live = typeof snapshot.gameID === "string" ? liveByGameID.get(snapshot.gameID) : undefined;
                if (!live) return snapshot;
                return {
                    ...snapshot,
                    whiteName: live.whiteName || live.WhiteName || snapshot.whiteName || snapshot.WhiteName || "White",
                    blackName: live.blackName || live.BlackName || snapshot.blackName || snapshot.BlackName || "Black",
                    WhiteName: live.whiteName || live.WhiteName || snapshot.whiteName || snapshot.WhiteName || "White",
                    BlackName: live.blackName || live.BlackName || snapshot.blackName || snapshot.BlackName || "Black",
                    pgn: live.pgn || snapshot.pgn || "",
                    initialFen: live.initialFen || snapshot.initialFen,
                    uciHistory: Array.isArray(live.uciHistory) && live.uciHistory.length ? live.uciHistory : snapshot.uciHistory ?? [],
                    fenHistory: Array.isArray(live.fenHistory) && live.fenHistory.length ? live.fenHistory : snapshot.fenHistory ?? [],
                    moveDurationsMs: Array.isArray(live.moveDurationsMs) && live.moveDurationsMs.length ? live.moveDurationsMs : snapshot.moveDurationsMs ?? [],
                    boardID: live.boardID || snapshot.boardID,
                    location: live.location || snapshot.location,
                    Date: snapshot.Date || live.startedAt || live.createdAt,
                    round: live.round ?? snapshot.round,
                    startedAt: live.startedAt || snapshot.startedAt,
                    lastMoveAt: live.lastMoveAt || snapshot.lastMoveAt,
                    durationSec: live.durationSec ?? snapshot.durationSec,
                    initialTimeMs: live.initialTimeMs ?? snapshot.initialTimeMs,
                    incrementMs: live.incrementMs ?? snapshot.incrementMs,
                    timeControlType: resolveTimeControlType(
                        live.initialTimeMs ?? snapshot.initialTimeMs,
                        live.incrementMs ?? snapshot.incrementMs,
                        snapshot.timeControlType ?? live.timeControlType,
                    ),
                };
            });

            res.json(games.map(serializeHistoryRecord));
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Unable to load game history" });
        }
    },

    async saveHistoryAnalysis(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            const body = req.body as { moves?: unknown; depth?: unknown };
            if (!Array.isArray(body.moves) || body.moves.length === 0 || body.moves.length > 600) {
                res.status(400).json({ error: "Invalid analysis moves" });
                return;
            }
            const validClasses = new Set(["best", "brilliant", "excellent", "good", "inaccuracy", "mistake", "blunder", "unavailable"]);
            const valid = body.moves.every((move) => {
                if (!move || typeof move !== "object") return false;
                const record = move as Record<string, unknown>;
                return Number.isInteger(record.ply) && typeof record.san === "string" && record.san.length <= 32
                    && typeof record.uci === "string" && (record.uci === "?" || /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(record.uci))
                    && typeof record.bestMove === "string" && record.bestMove.length <= 8
                    && typeof record.classification === "string" && validClasses.has(record.classification)
                    && Number.isInteger(record.depth) && Number(record.depth) >= 0 && Number(record.depth) <= 30
                    && (record.principalVariation === undefined || (Array.isArray(record.principalVariation)
                        && record.principalVariation.length <= 8
                        && record.principalVariation.every((item) => typeof item === "string" && item.length <= 8)));
            });
            if (!valid) {
                res.status(400).json({ error: "Invalid analysis payload" });
                return;
            }
            const depth = typeof body.depth === "number" && Number.isInteger(body.depth) ? body.depth : 14;
            const saved = await saveHistoryAnalysis(req.params.id, {
                engine: "Stockfish 18 Lite",
                depth: Math.max(1, Math.min(depth, 30)),
                updatedAt: new Date(),
                moves: body.moves,
            });
            if (!saved) {
                res.status(404).json({ error: "History record not found" });
                return;
            }
            res.json({ success: true });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Unable to save history analysis" });
        }
    },

    /** Updates administrator-editable PGN and electronic-board UCI traces only. */
    async updateHistoryTraces(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            const body = (req.body ?? {}) as { pgn?: unknown; uciHistory?: unknown };
            const hasPgn = Object.prototype.hasOwnProperty.call(body, "pgn");
            const hasUci = Object.prototype.hasOwnProperty.call(body, "uciHistory");
            if (!hasPgn && !hasUci) {
                res.status(400).json({ error: "At least one trace is required" });
                return;
            }
            if (hasPgn && (typeof body.pgn !== "string" || body.pgn.length > 200_000)) {
                res.status(400).json({ error: "Invalid PGN" });
                return;
            }
            if (hasUci && (!Array.isArray(body.uciHistory) || body.uciHistory.length > 2_000
                || !body.uciHistory.every((move) => typeof move === "string" && move.length <= 32))) {
                res.status(400).json({ error: "Invalid UCI history" });
                return;
            }
            const saved = await updateHistoryTraces(req.params.id, {
                ...(hasPgn ? { pgn: body.pgn as string } : {}),
                ...(hasUci ? { uciHistory: body.uciHistory as string[] } : {}),
            });
            if (saved.status === "not_found") {
                res.status(404).json({ error: "History record not found" });
                return;
            }
            if (saved.status === "active") {
                res.status(409).json({ error: "Cannot edit an active game" });
                return;
            }
            res.json({ success: true, pgn: saved.pgn, uciHistory: saved.uciHistory });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Unable to update history traces" });
        }
    },

    /** Deletes one FEN snapshot from a non-deleted history record. */
    async deleteHistoryFen(req: Request<GameIdParams & { index: string }>, res: Response): Promise<void> {
        try {
            const index = Number(req.params.index);
            const result = await deleteHistoryFen(req.params.id, index);
            if (result.status === "not_found") {
                res.status(404).json({ error: "History record not found" });
                return;
            }
            if (result.status === "active") {
                res.status(409).json({ error: "Cannot edit an active game" });
                return;
            }
            if (result.status === "invalid_index") {
                res.status(400).json({ error: "Invalid FEN index" });
                return;
            }
            if (result.status === "conflict") {
                res.status(409).json({ error: "FEN history changed; reload and try again" });
                return;
            }
            if (result.status === "deleted") {
                res.json({ success: true, fenHistoryEdited: result.fenHistory });
                return;
            }
            res.status(500).json({ error: "Unable to delete FEN snapshot" });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Unable to delete FEN snapshot" });
        }
    },

    /** Appends one administrator-supplied FEN snapshot without legality checks. */
    async appendHistoryFen(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            const fen = storedFen(req.body?.fen);
            if (!fen) {
                res.status(400).json({ error: "FEN value must be a non-empty string", code: "INVALID_FEN" });
                return;
            }
            const result = await appendHistoryFen(req.params.id, fen);
            if (result.status === "not_found") {
                res.status(404).json({ error: "History record not found" });
                return;
            }
            if (result.status === "active") {
                res.status(409).json({ error: "Cannot edit an active game" });
                return;
            }
            if (result.status === "conflict") {
                res.status(409).json({ error: "FEN history changed; reload and try again" });
                return;
            }
            res.json({ success: true, fenHistoryEdited: result.fenHistory });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Unable to append FEN snapshot" });
        }
    },

    /** Replaces one FEN snapshot without enforcing chess legality. */
    async updateHistoryFen(req: Request<GameIdParams & { index: string }>, res: Response): Promise<void> {
        try {
            const index = Number(req.params.index);
            const fen = storedFen(req.body?.fen);
            if (!fen) {
                res.status(400).json({ error: "FEN value must be a non-empty string", code: "INVALID_FEN" });
                return;
            }
            const result = await updateHistoryFen(req.params.id, index, fen);
            if (result.status === "not_found") {
                res.status(404).json({ error: "History record not found" });
                return;
            }
            if (result.status === "active") {
                res.status(409).json({ error: "Cannot edit an active game" });
                return;
            }
            if (result.status === "invalid_index") {
                res.status(400).json({ error: "Invalid FEN index" });
                return;
            }
            if (result.status === "conflict") {
                res.status(409).json({ error: "FEN history changed; reload and try again" });
                return;
            }
            res.json({ success: true, fenHistoryEdited: result.fenHistory });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Unable to update FEN snapshot" });
        }
    },

    /** Replaces a complete FEN sequence without enforcing chess legality. */
    async replaceHistoryFens(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            if (!Array.isArray(req.body?.fenHistory) || req.body.fenHistory.length === 0 || req.body.fenHistory.length > 1000) {
                res.status(400).json({ error: "Invalid FEN history", code: "INVALID_FEN_HISTORY" });
                return;
            }
            const fenHistory = req.body.fenHistory.map((value: unknown) => storedFen(value));
            const invalidIndex = fenHistory.findIndex((fen: string | null) => fen === null);
            if (invalidIndex >= 0) {
                res.status(400).json({ error: "FEN value must be a non-empty string", code: "INVALID_FEN", index: invalidIndex });
                return;
            }
            const result = await replaceHistoryFenList(req.params.id, fenHistory as string[]);
            if (result.status === "not_found") {
                res.status(404).json({ error: "History record not found" });
                return;
            }
            if (result.status === "active") {
                res.status(409).json({ error: "Cannot edit an active game" });
                return;
            }
            if (result.status === "conflict") {
                res.status(409).json({ error: "FEN history changed; reload and try again" });
                return;
            }
            res.json({ success: true, fenHistoryEdited: result.fenHistory });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Unable to replace FEN history" });
        }
    },

    // delete history of game
    async deleteHistory(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            const moved = await moveHistoryToTrash(req.params.id);
            if (!moved) {
                res.status(404).json({ error: "History record not found or already in trash" });
                return;
            }
            res.json({ success: true, retentionDays: 30 });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Unable to move history to trash" });
        }
    },

    async getHistoryTrash(_req: Request, res: Response): Promise<void> {
        try {
            const games = await getPGNCollections()
                .find({ deletedAt: { $exists: true } })
                .sort({ deletedAt: -1 })
                .toArray();
            res.json(games.map(serializeHistoryRecord));
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Unable to load history trash" });
        }
    },

    async restoreHistory(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            const restored = await restoreHistoryFromTrash(req.params.id);
            if (!restored) {
                res.status(404).json({ error: "Trashed history record not found" });
                return;
            }
            res.json({ success: true });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Unable to restore history" });
        }
    },

    async permanentlyDeleteHistory(req: Request<GameIdParams>, res: Response): Promise<void> {
        try {
            const deleted = await permanentlyDeleteHistoryFromTrash(req.params.id);
            if (!deleted) {
                res.status(404).json({ error: "Trashed history record not found" });
                return;
            }
            res.json({ success: true });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Unable to permanently delete history" });
        }
    },

    async permanentlyDeleteAllHistory(_req: Request, res: Response): Promise<void> {
        try {
            const deletedCount = await permanentlyDeleteAllHistoryFromTrash();
            res.json({ success: true, deletedCount });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Unable to permanently delete history trash" });
        }
    },

    // get state initcheck
    async initcheck(req: Request<GameIdParams>, res: Response): Promise<Response | void> {
        try {
            const gameID = req.params.id;
            const boardID = getBoardIDByGame(gameID);
            const state = boardID ? gameState.get(boardID) : undefined;

            // no state yet
            if (!state) {
                return res.status(200).json({
                    gameID,
                    status: GAME_STATUS.WAITING,
                    buttonReady: false,
                    missingSquares: [],
                    extraSquares: [],
                    wrongPieceSquares: [],
                })
            }

            // current initcheck state
            return res.status(200).json({
                gameID,
                status: state.initResultStatus ?? state.gameStatus,
                buttonReady: state.buttonReady === true,
                missingSquares: state.missingSquares || [],
                extraSquares: state.extraSquares || [],
                wrongPieceSquares: state.wrongPieceSquares || [],
            });
        } catch (e) {
            console.log("Init check error", e);

            return res.status(500).json({
                status: ERROR_STATUS.SERVER_ERROR,
            });
        }
    },
}
