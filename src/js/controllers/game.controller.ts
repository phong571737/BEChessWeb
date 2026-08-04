import { Request, Response } from "express";
import { getPGNCollections, getAllGame, getGameCollections, moveHistoryToTrash, permanentlyDeleteAllHistoryFromTrash, permanentlyDeleteHistoryFromTrash, restoreHistoryFromTrash, saveHistoryAnalysis } from "../models/game.model.js";
import { ERROR_STATUS, GAME_STATUS } from "../constant.js";
import { gameState } from "../game/game.state.js";
import { GameIdParams } from "../types/game.types.js";
import type { Document as MongoDocument, WithId } from "mongodb";
import { getBoardIDByGame } from "../game/game.manager.js";

function serializeHistoryRecord(record: WithId<MongoDocument>): MongoDocument & { _id: string } {
    return {
        ...record,
        _id: typeof record._id === "string" ? record._id : record._id?.toString?.() ?? "",
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
            res.json(game);
        } catch (e) {
            console.log(e);
        }
    },

    // get history of game
    async getHistory(req: Request, res: Response): Promise<void> {
        try {
            const history = await getPGNCollections()
                .find({ deletedAt: { $exists: false } })
                .sort({ createdAt: -1 }) // newest
                .toArray();

            // History snapshots created by older versions sometimes retained
            // only a move count. For an unfinished game the live game document
            // is still authoritative and contains its names, PGN, UCI/FEN
            // history, and current clock metadata. Enrich only incomplete
            // snapshots; finished history remains immutable.
            const activeIds = history
                .filter((row) => row.historyStatus === "active" || !row.Result || row.Result === "*")
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
                    WhiteName: live.WhiteName || snapshot.WhiteName || "White",
                    BlackName: live.BlackName || snapshot.BlackName || "Black",
                    pgn: live.pgn || snapshot.pgn || "",
                    initialFen: live.initialFen || snapshot.initialFen,
                    uciHistory: Array.isArray(live.uciHistory) && live.uciHistory.length ? live.uciHistory : snapshot.uciHistory ?? [],
                    fenHistory: Array.isArray(live.fenHistory) && live.fenHistory.length ? live.fenHistory : snapshot.fenHistory ?? [],
                    boardID: live.boardID || snapshot.boardID,
                    location: live.location || snapshot.location,
                    Date: snapshot.Date || live.startedAt || live.createdAt,
                    round: live.round ?? snapshot.round,
                    totalMoves: live.lastSeq ?? live.totalMoves ?? snapshot.totalMoves ?? 0,
                    totalPlies: live.lastSeq ?? live.totalMoves ?? snapshot.totalPlies ?? 0,
                    startedAt: live.startedAt || snapshot.startedAt,
                    lastMoveAt: live.lastMoveAt || snapshot.lastMoveAt,
                    durationSec: live.durationSec ?? snapshot.durationSec,
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
