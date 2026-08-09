import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { authLoginRateLimit, authRegisterRateLimit } from "../middleware/rate-limit.middleware.js";

const router = Router();

router.post("/register", authRegisterRateLimit, AuthController.register);
router.post("/login", authLoginRateLimit, AuthController.login);

export default router;
