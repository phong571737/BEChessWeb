import express from "express";
import { BoardController } from "../controllers/board.controller.js";

export const boardRouter = express.Router();

/**
 * POST /boards
 * Body: {gameID, uci ,seq}
 * Response: {ok}
 *This api is used to create game
 */
boardRouter.post("/", BoardController.create);

/**
 * POST /boards/current
 * This api used to get current boards
 * Body : {}
 * Response {}
 */
boardRouter.get("/", BoardController.getCurrent);