import express from "express";
import { BoardController } from "../controllers/board.controller.js";
import { BOARD_STATUS, BOARD_TYPE, ERROR_STATUS, MOVE_STATUS } from "../constant.js";
import { emitGameState, gameState } from "../game/game.state.js";
import { checkInitialBoard, checkInitialBoardNFC, convertHalltoBoard } from "../services/board.service.js";
import { getCurrentGame } from "../game/game.manager.js";

export const boardRouter = express.Router();

/**
 * POST /boards
 * This api is used to create game
 * Body: {boardID,}
 * Response 201, 200: {status: OK, boardID, gameID}
 * Response 400: { status: INVALID, MISSBOARD}
 * 500: {SERVER_ERROR}
 */
boardRouter.post("/", BoardController.create);

/**
 * POST /boards/current
 * This api used to get current boards
 * Body : {}
 * Response {}
 */
boardRouter.get("/", BoardController.getCurrent);

/**
 * POST boards/:id/initcheck
 * This api is used to send the state init of physicboard
 * Esp32 send 
 * Body: {boardType, board: {...}}
 * status: READY: board correct and button correct
 * WAITING_BUTTON: board correct button start button not correct
 * Response 200: { boardID, status: BOARD_STATUS}
 * Response 400: { status: INVALID, error}
 * Response 500: { status: SERVER ERROR, error} 
 */
boardRouter.post("/:id/initcheck", BoardController.initCheck);