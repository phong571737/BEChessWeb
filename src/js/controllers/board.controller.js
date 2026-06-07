import { GameService } from "../services/game.service.js";
import { getAllGame } from "../models/game.model.js";
import { ERROR_STATUS } from "../constant.js";
import { getCurrentGame } from "../game/game.manager.js";
import { BOARD_TYPE, BOARD_STATUS } from "../constant.js";
import { checkInitialBoard, checkInitialBoardNFC } from "../services/board.service.js";
import { gameState } from "../game/game.state.js";
import { emitGameState } from "../game/game.state.js";

export const BoardController = {
    // This function is used to create a new game
    async create(req, res) {
        try {
            const { boardID } = req.body;

            // miss boardID return 400
            if (!boardID) {
                return res.status(400).json({
                    status: ERROR_STATUS.INVALID,
                    error: ERROR_STATUS.MISS_BOARDID,
                });
            }

            const currentGame = getCurrentGame(boardID);
            if (currentGame) {
                return res.status(200).json({
                    status: "OK",
                    boardID,
                    gameID: currentGame,
                });
            }

            const gameID = crypto.randomUUID();

            await GameService.create(boardID, gameID);

            // Return 201 (create successfully)
            return res.status(201).json({
                status: "OK",
                boardID,
                gameID
            });
        } catch (e) {
            console.error(e);

            return res.status(500).json({
                ok: false,
                error: ERROR_STATUS.SERVER_ERROR,
            });
        }
    },

    // Get current game 
    async getCurrent(req, res) {
        try {
            const game = await getAllGame();
            if (!game) {
                return res.json(null);
            }
            res.json(game);
        } catch (e) {
            console.log(e);
        }
    },

    // Check init 
    async initCheck(req, res) {
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
            if (result.status === BOARD_STATUS.READY && buttonState !== true) {
                finalStatus = BOARD_STATUS.WAITING_BUTTON;
            }

            gameState.set(gameID, {
                status: finalStatus === BOARD_STATUS.READY ? BOARD_STATUS.READY : BOARD_STATUS.CHECK_INIT,
                missingSquares: result.missingSquares || [],
                extraSquares: result.extraSquares || [],
                wrongPieceSquares: result.wrongPieceSquares || [],
            });

            emitGameState(boardID);

            return res.status(200).json({
                boardID,
                status: finalStatus,
                missingSquares: result.missingSquares || [],
                extraSquares: result.extraSquares || [],
                wrongPieceSquares: result.wrongPieceSquares || [],
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