import express from "express";
import { getEval } from "../controllers/stockfish.controller.js";

export const evalRouter = express.Router();

/**
 * GET /eval
 * This api used to get evaluation
 */
evalRouter.get("/eval", getEval);