import express from "express";
import { BroadcastSettingController } from "../controllers/broadcast-setting.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";

export const broadcastSettingRouter = express.Router();

broadcastSettingRouter.get("/", requireAdmin, BroadcastSettingController.get);
broadcastSettingRouter.patch("/", requireAdmin, BroadcastSettingController.update);
