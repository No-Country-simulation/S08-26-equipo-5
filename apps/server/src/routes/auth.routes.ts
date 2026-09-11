import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { validateBody } from "../middlewares/validateBody.js";
import { verifyToken } from "../middlewares/verifyToken.js";
import { PrismaUserRepository } from "../repositories/user.repository.js";
import { AuthService } from "../services/auth.service.js";

const userRepository = new PrismaUserRepository();
const authService = new AuthService(userRepository);
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

router.post("/logout", verifyToken, authController.logout.bind(authController));

export default router;