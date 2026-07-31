import express from "express";
import { BoardController } from "../controllers/board.controller.js";
import { boardCreateRateLimit, boardInitCheckRateLimit } from "../middleware/rate-limit.middleware.js";

export const boardRouter = express.Router();

/**
 * POST /boards
 * This api is used to create game
 * Body: {boardID,}
 * Response 201, 200: {status: OK, boardID, gameID}
 * Response 400: { status: INVALID, MISSBOARD}
 * 500: {SERVER_ERROR}
 */
boardRouter.post("/", boardCreateRateLimit, BoardController.create);

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
boardRouter.post("/:id/initcheck", boardInitCheckRateLimit, BoardController.initCheck);
