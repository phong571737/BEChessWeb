import express from "express";
import {makeMove} from "../game/game.manager.js";
import { saveGame } from "../models/game.model.js";
import {getIO} from "../sockets/index.js";
import { stockfishService } from "../services/stockfish.instance.js";
import { MoveController } from "../controllers/move.controller.js";

export const moveRouter = express.Router();

/**
 * POST /moves
 * This api is used to send move
*/
moveRouter.post("/", MoveController.handleMove);