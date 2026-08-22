import { Request, Response } from "express";
import { GameService } from "../services/game.service.js";
import { getAllGame, removeGame } from "../models/game.model.js";
import { getCurrentGame } from "../game/game.manager.js";
import { ERROR_STATUS, BOARD_TYPE, BOARD_STATUS } from "../constant.js";
import { checkInitialBoard, checkInitialBoardNFC, convertHalltoBoard } from "../services/board.service.js";
import { gameState, emitGameState } from "../game/game.state.js";
import { getIO } from "../sockets/index.js";
import { CreateBoardBody, InitCheckBody } from "../types/board.types.js";
import { GameIdParams } from "../types/game.types.js";
import { games, gameSeq, activeBranches } from "../game/game.repository.js";

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

            // const currentGame = getCurrentGame(boardID);
            // if (currentGame) {
            //     return res.status(200).json({
            //         status: "OK",
            //         boardID,
            //         gameID: currentGame,
            //     });
            // }

            const gameID = crypto.randomUUID();

            const created = await GameService.create(boardID, gameID);

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
            res.json(game);
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

            let result, board2D;

            // -------------- NFC BOARD -------------------------
            if (boardType === BOARD_TYPE.NFC) {
                if (typeof board !== "object" || Array.isArray(board)) {
                    return res.status(400).json({
                        status: ERROR_STATUS.INVALID,
                    });
                }

                result = checkInitialBoardNFC(board);
            }
            // -------------- HALL BOARD -------------------------
            else if (boardType === BOARD_TYPE.HALL) {
                if (!Array.isArray(board)) {
                    return res.status(400).json({
                        status: ERROR_STATUS.INVALID,
                        error: "HALL board must be an array",
                    });
                }

                board2D = convertHalltoBoard(board);
                result = checkInitialBoard(board2D);
            }
            else {
                return res.status(400).json({
                    status: BOARD_STATUS.INVALID,
                    error: "Unknown boardType",
                })
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
