import { Request, Response } from "express";
import { GameService } from "../services/game.service.js";
import { getAllGame } from "../models/game.model.js";
import { getCurrentGame } from "../game/game.manager.js";
import { ERROR_STATUS, BOARD_TYPE, BOARD_STATUS } from "../constant.js";
import { checkInitialBoard, checkInitialBoardNFC, convertHalltoBoard } from "../services/board.service.js";
import { gameState, emitGameState } from "../game/game.state.js";
import { getIO } from "../sockets/index.js";
import { CreateBoardBody, InitCheckBody, NFCBoard } from "../types/board.types.js";
import { GameIdParams } from "../types/game.types.js";
import { ensurePublicGameSnapshot } from "../services/spectator-delay.service.js";

type BoardCheckResult = ReturnType<typeof checkInitialBoard> | ReturnType<typeof checkInitialBoardNFC>;

function runInitialBoardCheck(boardType: unknown, board: unknown): BoardCheckResult {
    if (boardType === BOARD_TYPE.NFC) {
        if (typeof board !== "object" || board === null || Array.isArray(board)) {
            throw new Error("INVALID_NFC_BOARD");
        }
        return checkInitialBoardNFC(board as NFCBoard);
    }
    if (boardType === BOARD_TYPE.HALL) {
        if (!Array.isArray(board)) throw new Error("INVALID_HALL_BOARD");
        return checkInitialBoard(convertHalltoBoard(board));
    }
    throw new Error("INVALID_BOARD_TYPE");
}

export const BoardController = {
    // This function is used to create a new game
    async create(req: Request<unknown, unknown, CreateBoardBody>, res: Response): Promise<Response> {
        try {
            const { boardID } = req.body;

            // miss boardID return 400
            if (!boardID) {
                return res.status(400).json({
                    status: ERROR_STATUS.INVALID,
                    error: ERROR_STATUS.MISS_BOARDID,
                });
            }

            const gameID = crypto.randomUUID();

            const created = await GameService.create(boardID, gameID);
            await ensurePublicGameSnapshot(created);

            // Notify frontend clients that a board was scanned/created so UI updates immediately
            try {
                const io = getIO();
                io.emit("board_scan_ok", { boardID, gameID: created.gameID, status: "ok" });
            } catch (err) {
                // socket may not be initialized in some environments; ignore if so
                // console.warn("Socket not initialized, cannot emit board_scan_ok", err);
            }
            // Every board creation starts a new game session.
            return res.status(201).json({
                status: "OK",
                boardID,
                gameID: created.gameID
            });
        } catch (e) {
            if (e instanceof Error && e.message === "BOARD_CREATION_IN_PROGRESS") {
                return res.status(409).json({
                    ok: false,
                    error: "BOARD_CREATION_IN_PROGRESS",
                });
            }
            console.error(e);

            return res.status(500).json({
                ok: false,
                error: ERROR_STATUS.SERVER_ERROR,
            });
        }
    },

    // Get current game 
    async getCurrent(req: Request, res: Response): Promise<void> {
        try {
            const game = await getAllGame();
            if (!game) {
                res.json(null);
                return;
            }
            // Include the latest in-memory initial-board validation so a home
            // page opened after initcheck can still render the same warning
            // squares without waiting for the next physical-board scan.
            res.json(game.map((item) => {
                const state = item.boardID ? gameState.get(item.boardID) : undefined;
                return {
                    ...item,
                    initStatus: state?.initResultStatus ?? state?.gameStatus,
                    missingSquares: state?.missingSquares ?? [],
                    extraSquares: state?.extraSquares ?? [],
                    wrongPieceSquares: state?.wrongPieceSquares ?? [],
                };
            }));
        } catch (e) {
            console.log(e);
        }
    },

    // Check init 
    async initCheck(
        req: Request<GameIdParams, unknown, InitCheckBody>, 
        res: Response
    ): Promise<Response | void> {
        try {
            const boardID = req.params.id;
            const { boardType, board, buttonState } = req.body;

            const gameID = getCurrentGame(boardID);

            if (!board) {
                return res.status(400).json({
                    status: ERROR_STATUS.INVALID,
                    error: "Missing board"
                });
            }

            let result: BoardCheckResult;
            try {
                result = runInitialBoardCheck(boardType, board);
            } catch (error) {
                const reason = error instanceof Error ? error.message : "";
                if (reason === "INVALID_NFC_BOARD") return res.status(400).json({ status: ERROR_STATUS.INVALID });
                if (reason === "INVALID_HALL_BOARD") {
                    return res.status(400).json({ status: ERROR_STATUS.INVALID, error: "HALL board must be an array" });
                }
                return res.status(400).json({ status: BOARD_STATUS.INVALID, error: "Unknown boardType" });
            }

            let finalStatus = result.status;

            // getIO().to(gameID).emit("initcheck", {gameID, ...result});
            // check button state 
            if (result.status === BOARD_STATUS.READY && buttonState !== true) {
                finalStatus = BOARD_STATUS.WAITING_BUTTON;
            }

            const extraSquares = "extraSquares" in result ? result.extraSquares : result.wrongSquares;
            const wrongPieceSquares = "wrongPieceSquares" in result ? result.wrongPieceSquares : [];
            gameState.set(boardID, {
                gameStatus: finalStatus === BOARD_STATUS.READY ? BOARD_STATUS.READY : BOARD_STATUS.CHECK_INIT,
                initResultStatus: finalStatus,
                buttonReady: buttonState === true,
                missingSquares: result.missingSquares || [],
                extraSquares,
                wrongPieceSquares,
            });

            emitGameState(boardID);

            return res.status(200).json({
                boardID,
                status: finalStatus,
                missingSquares: result.missingSquares || [],
                extraSquares,
                wrongPieceSquares,
            });

        } catch (e) {
            console.log("Physical board update error", e);
            res.status(500).json({
                status: ERROR_STATUS.INVALID,
                error: ERROR_STATUS.SERVER_ERROR
            });
        }
    }
}
