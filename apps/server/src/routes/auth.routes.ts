import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { validateBody } from "../middlewares/validateBody.js";
import { PrismaUserRepository } from "../repositories/user.repository.js";
import { PrismaRefreshTokenRepository } from "../repositories/refreshToken.repository.js";
import { AuthService } from "../services/auth.service.js";

const userRepository = new PrismaUserRepository();
const refreshTokenRepository = new PrismaRefreshTokenRepository();
const authService = new AuthService(userRepository, refreshTokenRepository);
const authController = new AuthController(authService);

const router = Router();

router.post(
  "/register",
  validateBody([
    { field: "nombre", required: true },
    { field: "apellido", required: true },
    { field: "email", required: true, email: true },
    { field: "password", required: true, minLength: 8 },
  ]),
  authController.register.bind(authController),
);

router.post(
  "/login",
  validateBody([
    { field: "email", required: true, email: true },
    { field: "password", required: true },
  ]),
  authController.login.bind(authController),
);

router.post(
  "/logout",
  validateBody([{ field: "refreshToken", required: true }]),
  authController.logout.bind(authController),
);

router.post(
  "/refresh",
  validateBody([{ field: "refreshToken", required: true }]),
  authController.refresh.bind(authController),
);

export default router;