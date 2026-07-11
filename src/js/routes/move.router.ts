import express, { Router } from "express";
import { MoveController } from "../controllers/move.controller.js";

export const moveRouter: Router = express.Router();

/**
 * POST /moves
 * This api is used to send move
*/
moveRouter.post("/", MoveController.handleMove);