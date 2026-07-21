import express, { Router } from "express";
import { MoveController } from "../controllers/move.controller.js";

export const moveRouter: Router = express.Router();

/**
 * POST /moves
 * This api is used to send move
*/
moveRouter.post("/", MoveController.handleMove);

// Simple health/read endpoint for quick browser checks (GET /moves)
moveRouter.get("/", (req, res) => {
	res.json({ ok: true, message: "POST /moves to submit a move" });
});